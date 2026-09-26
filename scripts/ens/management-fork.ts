/** Disposable fork smoke test. Only localhost impersonated accounts sign. */
import {
  prepareDelegateRotation,
  verifyDelegateRotation,
  prepareAdminHandover,
  adminAcceptanceMessage,
} from "../../packages/sdk/src/ens/management";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import assert from "node:assert/strict";
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
import { currentDeployment as d } from "../../packages/sdk/src/ens/current";
import { factoryAbi } from "../../packages/sdk/src/ens/abi";
import { providerInitialization, providerRegistryAbi } from "./provider-config";
const shared = true;
const ops: Address = "0x0000000000000000000000000000000000001002";
const treasury: Address = "0x0000000000000000000000000000000000001003";
const cwd = process.cwd();
const dir = await mkdtemp(`${tmpdir()}/ens402-provider-`);
const probe = createServer();
await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = (probe.address() as { port: number }).port;
await new Promise<void>((resolve, reject) =>
  probe.close((error) => (error ? reject(error) : resolve())),
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
  { stdio: "ignore" },
);
let exited = false;
node.on("exit", () => {
  exited = true;
});
node.on("error", () => {
  exited = true;
});
const transport = http(`http://127.0.0.1:${port}`);
const client = createPublicClient({ chain: sepolia, transport });
const wallet = createWalletClient({ chain: sepolia, transport });
const admin: Address = "0x0000000000000000000000000000000000001001";
const root: Address = "0x84d3a426d4e12e955d1df95db0b24fe26afe39d3";
try {
  for (let i = 0; ; i++) {
    try {
      if (exited) throw Error("Anvil exited");
      assert.equal(await client.getChainId(), 11155111);
      break;
    } catch {
      if (exited || i > 80) throw Error("Anvil not ready");
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  for (const address of [admin, root]) {
    await client.request({
      method: "anvil_impersonateAccount" as never,
      params: [address] as never,
    });
    await client.request({
      method: "anvil_setBalance" as never,
      params: [address, "0x3635c9adc5dea00000"] as never,
    });
  }
  // Explicit local contract fixture, not a verified Safe deployment.
  if (shared)
    await client.request({
      method: "anvil_setCode" as never,
      params: [treasury, "0x00"] as never,
    });
  const init = providerInitialization(admin);
  const { result: platform } = await client.simulateContract({
    account: admin,
    address: d.factory,
    abi: factoryAbi,
    functionName: "deployProxy",
    args: [d.registryImplementation, 909901n, init],
  });
  await client.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: admin,
      address: d.factory,
      abi: factoryAbi,
      functionName: "deployProxy",
      args: [d.registryImplementation, 909901n, init],
    }),
  });
  // Test directly beneath a disposable root branch; planner requires .eth syntax, so use existing eth registry.
  const ethRegistry = await client.readContract({
    address: d.rootRegistry,
    abi: parseAbi(["function getSubregistry(string) view returns(address)"]),
    functionName: "getSubregistry",
    args: ["eth"],
  });
  await client.request({
    method: "anvil_impersonateAccount" as never,
    params: [d.ethRegistrar] as never,
  });
  await client.request({
    method: "anvil_setBalance" as never,
    params: [d.ethRegistrar, "0x3635c9adc5dea00000"] as never,
  });
  const block = await client.getBlock();
  await client.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: d.ethRegistrar,
      address: ethRegistry,
      abi: providerRegistryAbi,
      functionName: "register",
      args: [
        "providerfork402",
        admin,
        platform,
        zeroAddress,
        1n << 20n,
        block.timestamp + 86400n * 30n,
      ],
    }),
  });
  // Symlink compiled artifacts into temporary working directory, keeping generated plans isolated.
  const { symlink } = await import("node:fs/promises");
  await symlink(resolve(cwd, "contracts"), resolve(dir, "contracts"));
  const run = () =>
    new Promise<void>((ok, bad) => {
      const child = spawn(
        resolve(cwd, "node_modules/.bin/tsx"),
        [
          resolve(cwd, "scripts/provider-plan.ts"),
          "--with-service-registrar",
          ...(shared ? [] : ["--isolated-resolvers"]),
        ],
        {
          cwd: dir,
          env: {
            ...process.env,
            SEPOLIA_RPC_URL: `http://127.0.0.1:${port}`,
            ENS_PARENT_NAME: "providerfork402.eth",
            PROVIDER_LABEL: "alpha",
            PROVIDER_ADMIN_ADDRESS: admin,
            PLATFORM_REGISTRAR_ADDRESS: admin,
            PROVIDER_OPS_ADDRESS: ops,
            PROVIDER_TREASURY_SAFE_ADDRESS: treasury,
          },
          stdio: "inherit",
        },
      );
      child.on("exit", (code) =>
        code === 0 ? ok() : bad(Error(`planner ${code}`)),
      );
    });
  const plan = async () =>
    JSON.parse(
      await readFile(
        resolve(dir, "docs/setup/provider-alpha-transactions.json"),
        "utf8",
      ),
    );
  const send = async (tx: any) =>
    client.waitForTransactionReceipt({
      hash: await wallet.sendTransaction({
        account: tx.signer,
        to: tx.to,
        data: tx.data,
        value: 0n,
      }),
    });
  await run();
  let p = await plan();
  assert.equal(p.transactions.length, 2);
  await send(p.transactions[0]);
  await run();
  p = await plan();
  assert.equal(p.transactions.length, 1);
  await send(p.transactions[0]);
  await run();
  p = await plan();
  assert.equal(p.transactions.length, 0);
  if (shared) {
    assert.equal(p.sharedResolver.transactions.length, 1);
    await send(p.sharedResolver.transactions[0]);
    await run();
    p = await plan();
    assert.equal(p.sharedResolver.transactions.length, 5);
    for (const tx of p.sharedResolver.transactions) await send(tx);
    await run();
    p = await plan();
    assert.equal(p.sharedResolver.transactions.length, 0);
  }
  assert.equal(p.registrarPlan.verified, false);
  const receipt = await send(p.registrarPlan.transactions[0]);
  process.env.PROVIDER_SERVICE_REGISTRAR_ADDRESS = receipt.contractAddress!;
  await run();
  p = await plan();
  assert.equal(p.registrarPlan.verified, true);
  assert.equal(p.registrarPlan.transactions.length, shared ? 7 : 1);
  for (const tx of p.registrarPlan.transactions) await send(tx);
  await run();
  p = await plan();
  assert.equal(p.registrarPlan.transactions.length, 0);
  const nextOps: Address = "0x0000000000000000000000000000000000001004";
  const rotation = {
    resolver: p.sharedResolver.resolver,
    admin,
    outgoing: ops,
    incoming: nextOps,
    role: "ops" as const,
    name: "alpha.providerfork402.eth",
  };
  await assert.rejects(
    prepareDelegateRotation(client, { ...rotation, role: "wrong" as "ops" }),
    /Unsupported/,
  );
  await assert.rejects(
    prepareDelegateRotation(client, {
      ...rotation,
      outgoing: "0x0000000000000000000000000000000000001098",
    }),
    /does not hold/,
  );
  const prepared = await prepareDelegateRotation(client, rotation);
  await send({ ...prepared.transaction, signer: prepared.transaction.from });
  assert.equal((await verifyDelegateRotation(client, rotation)).passed, true);
  // A broad override must prevent a misleading narrow rotation.
  const permissionAbi = parseAbi([
    "function grantRootRoles(uint256,address) returns(bool)",
    "function revokeRootRoles(uint256,address) returns(bool)",
  ]);
  await client.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: admin,
      address: p.sharedResolver.resolver,
      abi: permissionAbi,
      functionName: "grantRootRoles",
      args: [16n, ops],
    }),
  });
  await assert.rejects(
    prepareDelegateRotation(client, rotation),
    /root privileges/,
  );
  await client.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: admin,
      address: p.sharedResolver.resolver,
      abi: permissionAbi,
      functionName: "revokeRootRoles",
      args: [16n, ops],
    }),
  });
  const newTreasury: Address = "0x0000000000000000000000000000000000001005";
  await client.request({
    method: "anvil_setCode" as never,
    params: [newTreasury, "0x00"] as never,
  });
  const treasuryRotation = {
    ...rotation,
    outgoing: treasury,
    incoming: newTreasury,
    role: "treasury" as const,
  };
  const treasuryPlan = await prepareDelegateRotation(client, treasuryRotation);
  await send({
    ...treasuryPlan.transaction,
    signer: treasuryPlan.transaction.from,
  });
  assert.equal(
    (await verifyDelegateRotation(client, treasuryRotation)).passed,
    true,
  );
  const incoming = privateKeyToAccount(generatePrivateKey());
  await client.request({
    method: "anvil_impersonateAccount" as never,
    params: [incoming.address] as never,
  });
  await client.request({
    method: "anvil_setBalance" as never,
    params: [incoming.address, "0x3635c9adc5dea00000"] as never,
  });
  const handover = {
    outgoing: admin,
    incoming: incoming.address,
    resolver: p.sharedResolver.resolver,
    registry: p.registry,
    nameRegistry: platform,
    label: "alpha",
    nonce: `0x${"42".repeat(32)}` as `0x${string}`,
    deadline: Number((await client.getBlock()).timestamp) + 3600,
  };
  const signature = await incoming.signMessage({
    message: adminAcceptanceMessage(handover),
  });
  await assert.rejects(
    prepareAdminHandover(client, { ...handover, label: "beta" }, signature),
    /not accepted/,
  );
  await assert.rejects(
    prepareAdminHandover(client, handover, signature),
    /independently configured/,
  );
  const omitted = { ...handover, resolver: undefined };
  const omittedSignature = await incoming.signMessage({
    message: adminAcceptanceMessage(omitted),
  });
  await assert.rejects(
    prepareAdminHandover(client, omitted, omittedSignature, {
      providerRegistry: p.registry,
      resolver: p.sharedResolver.resolver,
    }),
    /must include resolver/,
  );
  const crossed = { ...handover, registry: platform };
  const crossedSignature = await incoming.signMessage({
    message: adminAcceptanceMessage(crossed),
  });
  await assert.rejects(
    prepareAdminHandover(client, crossed, crossedSignature),
    /live name pointer/,
  );
  const stages: string[] = [];
  for (let i = 0; i < 8; i++) {
    const step = await prepareAdminHandover(client, handover, signature, {
      providerRegistry: p.registry,
      resolver: p.sharedResolver.resolver,
    });
    stages.push(step.stage);
    if (!step.transaction) break;
    await send({ ...step.transaction, signer: step.transaction.from });
  }
  assert.deepEqual(stages, [
    "grant-incoming",
    "grant-incoming",
    "transfer-name",
    "remove-outgoing",
    "remove-outgoing",
    "complete",
  ]);
  assert.equal((await verifyDelegateRotation(client, rotation)).passed, true);
  console.log(
    "PASS: native atomic Ops rotation, broad-rights rejection, signed incoming acceptance, resumable Admin transfer and postchecks",
  );
  console.log(shared ? "SHARED RESOLVER" : "ISOLATED RESOLVERS");
  console.log(
    "PASS: provider plan deployment, resume, native link, restricted registrar runtime verification and grant",
  );
} finally {
  node.kill();
  await rm(dir, { recursive: true, force: true });
}
