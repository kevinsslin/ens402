import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { config } from "dotenv";
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseAbi,
  zeroAddress,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import {
  resolveService,
  prepareRecordUpdate,
  prepareTextPermission,
  simulateEnsTransaction,
  currentDeployment as ensDeployment,
  factoryAbi,
  currentResolverAbi as resolverAbi,
  currentRegistryAbi,
} from "../packages/sdk/src/ens/index";
import { auditTextPermissions } from "../packages/sdk/src/ens/permissions";
import { registryAbi } from "../packages/sdk/src/ens/abi";
import { USDC, NETWORK } from "../packages/sdk/src/index";
config({ path: ".env", quiet: true });
const server = createServer();
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;
await new Promise<void>((resolve, reject) =>
  server.close((error) => (error ? reject(error) : resolve())),
);
const node = spawn(
  "anvil",
  [
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--fork-url",
    process.env.ENS_FORK_RPC_URL || "https://sepolia.gateway.tenderly.co",
    "--fork-block-number",
    "11783987",
    "--no-storage-caching",
    "--silent",
  ],
  { stdio: ["ignore", "ignore", "ignore"] },
);
let exited = false;
node.on("exit", () => {
  exited = true;
});
node.on("error", () => {
  exited = true;
});
const transport = http(`http://127.0.0.1:${port}`, {
  timeout: 10000,
  retryCount: 0,
});
const client = createPublicClient({ chain: sepolia, transport });
const checks: string[] = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && !exited; attempt++) {
    try {
      if ((await client.getChainId()) === 11155111) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("Anvil fork did not start");
  const admin = "0x1000000000000000000000000000000000000001" as Address;
  const ops = "0x1000000000000000000000000000000000000002" as Address;
  const rootAdmin = "0x84d3a426d4e12e955d1df95db0b24fe26afe39d3" as Address;
  for (const address of [admin, rootAdmin]) {
    await client.request({
      method: "anvil_impersonateAccount" as never,
      params: [address] as never,
    });
    await client.request({
      method: "anvil_setBalance" as never,
      params: [address, "0x3635c9adc5dea00000"] as never,
    });
  }
  const wallet = createWalletClient({
    chain: sepolia,
    transport,
    account: admin,
  });
  const send = async (
    to: Address,
    data: `0x${string}`,
    account: Address = admin,
  ) => {
    const hash = await wallet.sendTransaction({
      account,
      to,
      data,
      gas: 2000000n,
    });
    assert.equal(
      (await client.waitForTransactionReceipt({ hash })).status,
      "success",
    );
  };
  const deploy = async (
    implementation: Address,
    salt: bigint,
    data: `0x${string}`,
  ) => {
    const prepared = await client.simulateContract({
      account: admin,
      address: ensDeployment.factory,
      abi: factoryAbi,
      functionName: "deployProxy",
      args: [implementation, salt, data],
    });
    await send(
      ensDeployment.factory,
      encodeFunctionData({
        abi: factoryAbi,
        functionName: "deployProxy",
        args: [implementation, salt, data],
      }),
    );
    return prepared.result;
  };
  const textRoles = 16n | (16n << 128n);
  const resolver = await deploy(
    ensDeployment.resolverImplementation,
    402n,
    encodeFunctionData({
      abi: resolverAbi,
      functionName: "initialize",
      args: [[{ account: admin, roleBitmap: textRoles }], []],
    }),
  );
  const registry = await deploy(
    ensDeployment.registryImplementation,
    403n,
    encodeFunctionData({
      abi: currentRegistryAbi,
      functionName: "initialize",
      args: [[{ account: admin, roleBitmap: 1n | (1n << 128n) }]],
    }),
  );
  const now = Number((await client.getBlock()).timestamp);
  const expiry = BigInt(now + 30 * 86400);
  await send(
    ensDeployment.rootRegistry,
    encodeFunctionData({
      abi: registryAbi,
      functionName: "register",
      args: [
        "ens402fork",
        admin,
        registry,
        resolver,
        (1n << 24n) | (1n << 20n),
        expiry,
      ],
    }),
    rootAdmin,
  );
  await send(
    registry,
    encodeFunctionData({
      abi: registryAbi,
      functionName: "register",
      args: ["search", admin, zeroAddress, resolver, 1n << 24n, expiry],
    }),
  );
  const { packetToBytes } = await import("viem/ens");
  const { bytesToHex } = await import("viem");
  const name = "search.ens402fork";
  const records = {
    "agent-endpoint[x402]": "https://merchant.example/search/v1",
    "ens402.payment": JSON.stringify({
      version: 2,
      pricing: { model: "fixed", amount: "10000", unit: "request" },
      scheme: "exact",
      network: NETWORK,
      asset: USDC,
      payTo: admin,
    }),
    "ens402.status": "active",
    description: "Search public data",
    avatar: "https://merchant.example/icon.png",
  };
  for (const [key, value] of Object.entries(records))
    await send(
      resolver,
      encodeFunctionData({
        abi: resolverAbi,
        functionName: "setText",
        args: [bytesToHex(packetToBytes(name)), key, value],
      }),
    );
  const read = async () =>
    resolveService(
      client,
      name,
      Number((await client.getBlock()).timestamp),
      "current",
    );
  const original = await read();
  assert.equal(original.owner.toLowerCase(), admin);
  assert.equal(original.endpoint, records["agent-endpoint[x402]"]);
  assert.equal(original.description, "Search public data");
  assert.equal(original.payment.version, 2);
  checks.push(
    "Fixed-price v2 record and public metadata resolved from actual native records",
  );
  checks.push(
    "Registered fork name resolved via pinned UniversalResolver, owner and factory checks",
  );
  const grant = prepareTextPermission(
    original,
    "agent-endpoint[x402]",
    ops,
    true,
  );
  await simulateEnsTransaction(client, admin, grant);
  await send(grant.to, grant.data);
  const moved = prepareRecordUpdate(
    await read(),
    "agent-endpoint[x402]",
    "https://merchant.example/search/v2",
  );
  assert.equal(
    (await simulateEnsTransaction(client, ops, moved)).broadTextPermission,
    false,
  );
  await client.request({
    method: "anvil_impersonateAccount" as never,
    params: [ops] as never,
  });
  await client.request({
    method: "anvil_setBalance" as never,
    params: [ops, "0x3635c9adc5dea00000"] as never,
  });
  await send(moved.to, moved.data, ops);
  const after = await read();
  assert.equal(after.endpoint, "https://merchant.example/search/v2");
  assert.equal(after.authority, original.authority);
  checks.push(
    "Endpoint-only grant permits update and SDK resolves the changed route",
  );
  const payment = prepareRecordUpdate(
    after,
    "ens402.payment",
    records["ens402.payment"],
  );
  await assert.rejects(() => simulateEnsTransaction(client, ops, payment));
  checks.push("Operator payment edit rejected by the actual native resolver");
  const treasury = "0x3333333333333333333333333333333333333333" as Address;
  for (const key of ["description", "avatar"] as const) {
    const tx = prepareTextPermission(after, key, ops, true);
    await send(tx.to, tx.data);
  }
  const treasuryGrant = prepareTextPermission(
    after,
    "ens402.payment",
    treasury,
    true,
  );
  await send(treasuryGrant.to, treasuryGrant.data);
  const audit = () =>
    auditTextPermissions(client, { resolver, admin, ops, treasury });
  assert.equal((await audit()).passed, true);
  const rootAbi = parseAbi([
    "function grantRootRoles(uint256,address) returns(bool)",
    "function revokeRootRoles(uint256,address) returns(bool)",
  ]);
  await send(
    resolver,
    encodeFunctionData({
      abi: rootAbi,
      functionName: "grantRootRoles",
      args: [16n, ops],
    }),
  );
  assert.equal((await audit()).passed, false);
  await send(
    resolver,
    encodeFunctionData({
      abi: rootAbi,
      functionName: "revokeRootRoles",
      args: [16n, ops],
    }),
  );
  assert.equal((await audit()).passed, true);
  checks.push(
    "Live role audit detects both intended grants and accidental root privileges",
  );
  const revoke = prepareTextPermission(
    after,
    "agent-endpoint[x402]",
    ops,
    false,
  );
  await send(revoke.to, revoke.data);
  assert.equal((await audit()).passed, false);
  await assert.rejects(() => simulateEnsTransaction(client, ops, moved));
  assert.equal((await read()).endpoint, after.endpoint);
  checks.push(
    "Revocation rejects later writes while retaining the published record",
  );
  let payments;
  if (process.argv.includes("--payments")) {
    const currentTime = Math.floor(Date.now() / 1000);
    if (Number((await client.getBlock()).timestamp) < currentTime) {
      await client.request({
        method: "evm_setNextBlockTimestamp" as never,
        params: [currentTime] as never,
      });
      await client.request({
        method: "evm_mine" as never,
        params: [] as never,
      });
    }
    const { testAnvilPayments } = await import("./anvil-payment");
    const { privateKeyToAccount } = await import("viem/accounts");
    const workerKey = `0x${"22".repeat(32)}` as const;
    const worker = privateKeyToAccount(workerKey);
    await client.request({
      method: "anvil_setBalance" as never,
      params: [worker.address, "0x3635c9adc5dea00000"] as never,
    });
    await send(
      registry,
      encodeFunctionData({
        abi: parseAbi(["function grantRootRoles(uint256,address)"]),
        functionName: "grantRootRoles",
        args: [1n, worker.address],
      }),
    );
    payments = await testAnvilPayments(
      read,
      async (payTo) => {
        const update = prepareRecordUpdate(
          await read(),
          "ens402.payment",
          JSON.stringify({
            version: 2,
            pricing: { model: "fixed", amount: "10000", unit: "request" },
            scheme: "exact",
            network: NETWORK,
            asset: USDC,
            payTo,
          }),
        );
        await send(update.to, update.data);
      },
      {
        rpc: `http://127.0.0.1:${port}`,
        parent: "ens402fork",
        registry,
        workerKey,
        expiry: expiry.toString(),
      },
    );
  }
  await send(
    resolver,
    encodeFunctionData({
      abi: resolverAbi,
      functionName: "setText",
      args: [
        bytesToHex(packetToBytes("other.ens402fork")),
        "ens402.status",
        "active",
      ],
    }),
  );
  await assert.rejects(read, /dedicated one-record/);
  checks.push("SDK rejects a resolver shared across multiple records");
  const report = {
    checkedAt: new Date().toISOString(),
    sourceBlock: 11783987,
    scope:
      "Disposable forks only; all registrations and transactions are local",
    checks,
    payments,
  };
  await mkdir("docs/validation", { recursive: true });
  await writeFile(
    payments
      ? "docs/validation/ens402-current-anvil-e2e.json"
      : "docs/validation/ens402-current-sdk-fork.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  node.kill("SIGTERM");
}
