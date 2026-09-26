/** Real local USDC settlement against Base Sepolia's deployed token on Anvil.
 * The signer, screening response and merchant/facilitator HTTP bridge are test adapters.
 */
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseSignature,
  type Address,
  type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  encodePaymentRequiredHeader,
  decodePaymentSignatureHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import {
  purchaseResource,
  type PublicAuthorization,
} from "../packages/sdk/src/http";
import { verifySettlement } from "../packages/sdk/src/settlement";
import {
  USDC,
  USDC_DECIMALS,
  NETWORK,
  type Approval,
  type RiskEvidence,
} from "../packages/sdk/src/index";
import type { ResolvedService } from "../packages/sdk/src/ens";
import { Store } from "../packages/server/src/store";
const exec = promisify(execFile);
const abi = parseAbi([
  "function decimals() view returns (uint8)",
  "function masterMinter() view returns (address)",
  "function configureMinter(address,uint256) returns (bool)",
  "function mint(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function authorizationState(address,bytes32) view returns (bool)",
  "function transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)",
]);
async function freePort() {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const p = (s.address() as { port: number }).port;
  await new Promise<void>((r) => s.close(() => r()));
  return p;
}
export async function testAnvilPayments(
  read: () => Promise<ResolvedService>,
  writePayee: (payTo: Address) => Promise<void>,
  registration?: {
    rpc: string;
    parent: string;
    registry: Address;
    workerKey: Hex;
    expiry: string;
  },
) {
  const checks: string[] = [];
  const service = await read();
  const port = await freePort();
  const upstream = createPublicClient({
    chain: baseSepolia,
    transport: http(
      process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      { retryCount: 1, timeout: 15000 },
    ),
  });
  const forkBlock = process.env.BASE_FORK_BLOCK
    ? BigInt(process.env.BASE_FORK_BLOCK)
    : await upstream.getBlockNumber();
  const node = spawn(
    "anvil",
    [
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--fork-url",
      process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      "--fork-block-number",
      String(forkBlock),
      "--no-storage-caching",
      "--silent",
    ],
    { stdio: "ignore" },
  );
  let exited = false;
  node.on("exit", () => {
    exited = true;
  });
  node.on("error", () => {
    exited = true;
  });
  const transport = http(`http://127.0.0.1:${port}`, {
    retryCount: 0,
    timeout: 15000,
  });
  const chain = createPublicClient({ chain: baseSepolia, transport });
  // Public fixture key, only funded on the disposable local fork.
  const payer = privateKeyToAccount(`0x${"11".repeat(32)}`);
  const wallet = createWalletClient({
    chain: baseSepolia,
    transport,
    account: payer,
  });
  const directory = await mkdtemp(join(tmpdir(), "ens402-anvil-pg-"));
  let dbStarted = false,
    store: Store | undefined;
  let databaseUrl = "";
  let registrationBody: string | undefined;
  let registrationServerStore: Store | undefined;
  let signed = 0,
    submitted = 0,
    mode: "normal" | "mismatch" | "timeout" | "delivery-error" = "normal",
    risky = false;
  let last:
    | { authorization: PublicAuthorization; signature: Hex; transaction: Hex }
    | undefined;
  const requirement = () => ({
    scheme: "exact",
    network: NETWORK,
    asset: USDC,
    payTo: mode === "mismatch" ? payer.address : service.payment.payTo,
    amount: "10000",
    maxTimeoutSeconds: 60,
    extra: {
      name: "USDC",
      version: "2",
      ...(registrationBody ? { ens402RequestBinding: "v1" } : {}),
    },
  });
  const settle = async (a: PublicAuthorization, signature: Hex) => {
    const { r, s, v, yParity } = parseSignature(signature);
    const hash = await wallet.writeContract({
      address: USDC,
      abi,
      functionName: "transferWithAuthorization",
      args: [
        a.from as Address,
        a.to as Address,
        BigInt(a.value),
        BigInt(a.validAfter),
        BigInt(a.validBefore),
        a.nonce as Hex,
        Number(v ?? BigInt(27 + yParity!)),
        r,
        s,
      ],
      gas: 250000n,
    });
    return { hash, receipt: await chain.waitForTransactionReceipt({ hash }) };
  };
  const merchant = createServer(async (req, res) => {
    try {
      const r = requirement();
      const header = req.headers["payment-signature"];
      if (!header) {
        res.writeHead(402, {
          "PAYMENT-REQUIRED": encodePaymentRequiredHeader({
            x402Version: 2,
            resource: { url: service.endpoint },
            accepts: [r],
          }),
        });
        res.end();
        return;
      }
      submitted++;
      const payload = decodePaymentSignatureHeader(String(header));
      const a = payload.payload.authorization as PublicAuthorization;
      if (registrationBody) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        assert.equal(Buffer.concat(chunks).toString(), registrationBody);
        const { requestNonce } = await import("../packages/sdk/src/request");
        assert.equal(
          a.nonce,
          requestNonce(service.endpoint, {
            method: "POST",
            body: registrationBody,
          }),
        );
      }
      const settled = await settle(a, payload.payload.signature as Hex);
      assert.equal(settled.receipt.status, "success");
      last = {
        authorization: a,
        signature: payload.payload.signature as Hex,
        transaction: settled.hash,
      };
      if (mode === "timeout") {
        res.destroy();
        return;
      }
      let output = "Anvil paid resource";
      if (registrationBody && registration) {
        Object.assign(process.env, {
          DATABASE_URL: databaseUrl,
          SEPOLIA_RPC_URL: registration.rpc,
          ENS_PARENT_NAME: registration.parent,
          ENS_PURCHASE_REGISTRY: registration.registry,
          ENS_REGISTRATION_PRIVATE_KEY: registration.workerKey,
          ENS_PURCHASE_EXPIRY: registration.expiry,
        });
        const { getStore } = await import("../packages/server/src/index");
        const { nativeRegistrationGateway, parseRegistrationOrder } =
          await import("../packages/server/src/registration");
        registrationServerStore = getStore();
        const order = parseRegistrationOrder(registrationBody);
        await registrationServerStore.claimRegistration(
          order,
          registration.parent,
          `test:${a.nonce}`,
          a,
          r,
          { registry: registration.registry, expiry: registration.expiry },
        );
        await verifySettlement(
          chain,
          {
            success: true,
            network: NETWORK,
            payer: payer.address,
            transaction: settled.hash,
          },
          a,
          r,
        );
        await registrationServerStore.payRegistration(order.orderId, {
          success: true,
          network: NETWORK,
          payer: payer.address,
          transaction: settled.hash,
        });
        const gateway = nativeRegistrationGateway();
        const result = await gateway.fulfill(order);
        assert.deepEqual(await gateway.fulfill(order), result);
        output = JSON.stringify(result);
      }
      res.writeHead(mode === "delivery-error" ? 500 : 200, {
        "PAYMENT-RESPONSE": encodePaymentResponseHeader({
          success: true,
          network: NETWORK,
          payer: payer.address,
          transaction: settled.hash,
        }),
      });
      res.end(output);
    } catch (error) {
      console.error(
        "Local merchant failure:",
        error instanceof Error ? error.message.split("\n")[0] : "unknown",
      );
      res.writeHead(500);
      res.end("Local settlement rejected");
    }
  });
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await chain.getChainId()) === 84532) break;
      } catch {}
      if (exited || i === 79) throw new Error("Base Anvil failed to start");
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.equal(await chain.getChainId(), 84532);
    assert.equal(
      await chain.readContract({
        address: USDC,
        abi,
        functionName: "decimals",
      }),
      USDC_DECIMALS,
    );
    checks.push(
      "Pinned Base Sepolia USDC contract returns 6 decimals; amounts remain atomic integers",
    );
    await chain.request({
      method: "anvil_setBalance" as never,
      params: [payer.address, "0x3635c9adc5dea00000"] as never,
    });
    const minter = await chain.readContract({
      address: USDC,
      abi,
      functionName: "masterMinter",
    });
    await chain.request({
      method: "anvil_impersonateAccount" as never,
      params: [minter] as never,
    });
    await chain.request({
      method: "anvil_setBalance" as never,
      params: [minter, "0x3635c9adc5dea00000"] as never,
    });
    const minterWallet = createWalletClient({
      chain: baseSepolia,
      transport,
      account: minter,
    });
    for (const call of [
      {
        functionName: "configureMinter" as const,
        args: [minter, 1000000n] as const,
      },
      {
        functionName: "mint" as const,
        args: [payer.address, 1000000n] as const,
      },
    ]) {
      const hash = await minterWallet.writeContract({
        address: USDC,
        abi,
        ...call,
        gas: 300000n,
      });
      assert.equal(
        (await chain.waitForTransactionReceipt({ hash })).status,
        "success",
      );
    }
    checks.push(
      "Funded only the local fork via native USDC minter; no token bytecode or storage replaced",
    );
    const dbPort = await freePort();
    await exec("initdb", [
      "-D",
      join(directory, "data"),
      "-U",
      "ens402_test",
      "-A",
      "trust",
      "--no-locale",
    ]);
    await exec("pg_ctl", [
      "-D",
      join(directory, "data"),
      "-l",
      join(directory, "postgres.log"),
      "-o",
      `-h 127.0.0.1 -p ${dbPort} -k ${directory}`,
      "-w",
      "start",
    ]);
    dbStarted = true;
    databaseUrl = `postgresql://ens402_test@127.0.0.1:${dbPort}/postgres`;
    store = new Store(databaseUrl);
    await store.migrate();
    await new Promise<void>((r) => merchant.listen(0, "127.0.0.1", r));
    const merchantPort = (merchant.address() as { port: number }).port;
    const now = () => Math.floor(Date.now() / 1000);
    const approval: Approval = {
      name: service.name,
      authority: service.authority,
      endpoints: [service.endpoint],
      payTo: service.payment.payTo,
      maxAmount: "10000",
      expiresAt: now() + 3600,
    };
    const approvalId = randomUUID();
    await store.createApproval({
      id: approvalId,
      fingerprint: approvalId,
      service,
      approval,
      dailyLimit: "30000",
    });
    await store.activate(
      approvalId,
      "local-signer",
      payer.address,
      "test-adapter-no-provider-policy",
    );
    const balance = () =>
      chain.readContract({
        address: USDC,
        abi,
        functionName: "balanceOf",
        args: [service.payment.payTo as Address],
      });
    const before = await balance();
    async function purchase(id = randomUUID()) {
      const reservation = await store!.reserve(id, approvalId, now());
      if (!reservation.created) return reservation.execution;
      const receipt = await purchaseResource({
        name: service.name,
        approval,
        resolve: read,
        signer: {
          address: payer.address,
          signTypedData: async (data) => {
            signed++;
            return payer.signTypedData(data);
          },
        },
        screen: async (address): Promise<RiskEvidence> => ({
          provider: "intercepta",
          network: "ethereum-mainnet",
          address,
          observedAt: now(),
          expiresAt: now() + 3600,
          cached: false,
          scan: { toxicScore: risky ? 1 : 0, traits: [] },
        }),
        transport: async (url, init) => {
          assert.equal(url, service.endpoint);
          return fetch(`http://127.0.0.1:${merchantPort}/resource`, init);
        },
        beforeSubmit: (a, r) => store!.beforeSubmit(id, a, r),
        verifySettlement: (s, a, r) => verifySettlement(chain, s, a, r),
        now,
      });
      return store!.finish(id, receipt);
    }
    const id = randomUUID();
    const success = await purchase(id);
    assert.equal(success.state, "settled", JSON.stringify(success.receipt));
    assert.equal(success.receipt?.resource, "Anvil paid resource");
    assert.equal(await balance(), before + 10000n);
    assert.equal(
      await chain.readContract({
        address: USDC,
        abi,
        functionName: "authorizationState",
        args: [payer.address, last!.authorization.nonce as Hex],
      }),
      true,
    );
    checks.push(
      "Native ENS resolution -> HTTP 402 -> real signature -> native USDC transfer -> chain nonce/receipt -> PostgreSQL receipt",
    );
    await purchase(id);
    assert.equal(submitted, 1);
    assert.equal(signed, 1);
    const replay = await settle(last!.authorization, last!.signature);
    assert.equal(replay.receipt.status, "reverted");
    assert.equal(await balance(), before + 10000n);
    checks.push(
      "Execution replay does not re-sign; on-chain authorization replay reverts without second transfer",
    );
    mode = "mismatch";
    assert.equal((await purchase()).state, "rejected");
    assert.equal(signed, 1);
    mode = "normal";
    risky = true;
    assert.equal((await purchase()).state, "held");
    assert.equal(signed, 1);
    risky = false;
    await writePayee(payer.address);
    assert.equal((await purchase()).state, "rejected");
    assert.equal(signed, 1);
    await writePayee(service.payment.payTo as Address);
    checks.push(
      "Mismatching 402, risky screening fixture and native ENS Treasury rotation stop before signing",
    );
    mode = "timeout";
    const uncertain = await purchase();
    assert.equal(uncertain.state, "uncertain");
    assert.equal(await balance(), before + 20000n);
    const payment = last!;
    await assert.rejects(() =>
      verifySettlement(
        chain,
        {
          success: true,
          network: NETWORK,
          transaction: payment.transaction,
          payer: payer.address,
        },
        { ...payment.authorization, nonce: `0x${"00".repeat(32)}` },
        uncertain.requirement!,
      ),
    );
    await verifySettlement(
      chain,
      {
        success: true,
        network: NETWORK,
        transaction: payment.transaction,
        payer: payer.address,
      },
      payment.authorization,
      uncertain.requirement!,
    );
    await store.finish(uncertain.id, {
      ...uncertain.receipt!,
      state: "paid_delivery_failed",
      reason: "Matched original nonce after lost HTTP response",
    });
    checks.push(
      "Lost HTTP response after settlement retains budget; wrong nonce fails; exact nonce reconciles payment",
    );
    mode = "delivery-error";
    assert.equal((await purchase()).state, "paid_delivery_failed");
    assert.equal(await balance(), before + 30000n);
    await assert.rejects(purchase, /Daily budget/);
    checks.push(
      "Paid API error remains spent; daily budget blocks a fourth transfer",
    );
    await store.revoke(approvalId);
    await assert.rejects(purchase, /inactive/);
    checks.push("Revoked approval cannot reserve or pay");
    if (registration) {
      mode = "normal";
      registrationBody = JSON.stringify({
        orderId: randomUUID(),
        label: "gift-audit",
        recipient: "0x000000000000000000000000000000000000beef",
      });
      const receipt = await purchaseResource({
        name: service.name,
        approval,
        request: { method: "POST", body: registrationBody },
        resolve: read,
        signer: payer,
        screen: async (address) => ({
          provider: "intercepta",
          network: "ethereum-mainnet",
          address,
          observedAt: now(),
          expiresAt: now() + 3600,
          cached: false,
          scan: { toxicScore: 0, traits: [] },
        }),
        transport: async (_url, init) =>
          fetch(`http://127.0.0.1:${merchantPort}/resource`, init),
        beforeSubmit: async () => {},
        verifySettlement: (s, a, r) => verifySettlement(chain, s, a, r),
      });
      assert.equal(receipt.state, "settled", JSON.stringify(receipt));
      const gift = JSON.parse(receipt.resource!);
      assert.equal(
        gift.owner.toLowerCase(),
        "0x000000000000000000000000000000000000beef",
      );
      assert.equal(gift.name, `gift-audit.${registration.parent}`);
      assert.equal(gift.resolver, null);
      checks.push(
        "Request-bound x402 payment settled real USDC, then production native registration gateway registered directly to recipient; persisted result replay issued no new ENS transaction",
      );
    }
    return {
      baseForkBlock: String(forkBlock),
      checks,
      boundaries: [
        "Native ENS and USDC contract bytecode on two disposable forks; all writes local",
        "Screening fixture and local signer do not prove Intercepta or Privy enforcement",
        "Local test merchant/relayer replaces the production merchant and public facilitator; existing server integration tests cover their orchestration separately",
        "Test HTTP bridge bypasses HTTPS/public-IP restriction only inside this harness; production transport unchanged",
      ],
    };
  } finally {
    merchant.closeAllConnections();
    await new Promise<void>((r) => merchant.close(() => r()));
    await store?.close();
    await registrationServerStore?.close();
    if (dbStarted)
      await exec("pg_ctl", [
        "-D",
        join(directory, "data"),
        "-m",
        "fast",
        "-w",
        "stop",
      ]);
    await rm(directory, { recursive: true, force: true });
    node.kill("SIGTERM");
  }
}
