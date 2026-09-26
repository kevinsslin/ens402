/** Disposable fork smoke test. Only localhost impersonated accounts sign. */
import { verifyStore } from "./fork-store";
import { snapshot } from "./snapshot";
import { currentResolverAbi } from "../../packages/sdk/src/ens/current";
import { bytesToHex } from "viem";
import { packetToBytes } from "viem/ens";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, http, encodeFunctionData, parseAbi, zeroAddress, type Address } from "viem";
import { sepolia } from "viem/chains";
import { currentDeployment as d } from "../../packages/sdk/src/ens/current";
import { factoryAbi } from "../../packages/sdk/src/ens/abi";
import { providerInitialization, providerRegistryAbi } from "../../scripts/ens/provider-config";
const shared = true;
const ops: Address = "0x0000000000000000000000000000000000001002";
const treasury: Address = "0x0000000000000000000000000000000000001003";
const cwd = process.cwd();
const dir = await mkdtemp(`${tmpdir()}/ens402-provider-`);
const probe = createServer();
await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
const port = (probe.address() as { port: number }).port;
await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
const node = spawn("anvil", ["--host", "127.0.0.1", "--port", String(port), "--fork-url", process.env.ENS_FORK_RPC_URL || "https://sepolia.gateway.tenderly.co", "--fork-block-number", "11783987", "--no-storage-caching", "--silent"], { stdio: "ignore" });
let exited = false;
node.on("exit", () => { exited = true; });
node.on("error", () => { exited = true; });
const transport = http(`http://127.0.0.1:${port}`);
const client = createPublicClient({ chain: sepolia, transport });
const wallet = createWalletClient({ chain: sepolia, transport });
const admin: Address = "0x0000000000000000000000000000000000001001";
const root: Address = "0x84d3a426d4e12e955d1df95db0b24fe26afe39d3";
try {
  for (let i = 0; ; i++) { try { if (exited) throw Error("Anvil exited"); assert.equal(await client.getChainId(), 11155111); break; } catch { if (exited || i > 80) throw Error("Anvil not ready"); await new Promise(r => setTimeout(r, 200)); } }
  for (const address of [admin, root]) {
    await client.request({ method: "anvil_impersonateAccount" as never, params: [address] as never });
    await client.request({ method: "anvil_setBalance" as never, params: [address, "0x3635c9adc5dea00000"] as never });
  }
  // Explicit local contract fixture, not a verified Safe deployment.
  if (shared) await client.request({ method: "anvil_setCode" as never, params: [treasury, "0x00"] as never });
  const init = providerInitialization(admin);
  const { result: platform } = await client.simulateContract({ account: admin, address: d.factory, abi: factoryAbi, functionName: "deployProxy", args: [d.registryImplementation, 909901n, init] });
  await client.waitForTransactionReceipt({ hash: await wallet.writeContract({ account: admin, address: d.factory, abi: factoryAbi, functionName: "deployProxy", args: [d.registryImplementation, 909901n, init] }) });
  // Test directly beneath a disposable root branch; planner requires .eth syntax, so use existing eth registry.
  const ethRegistry = await client.readContract({ address: d.rootRegistry, abi: parseAbi(["function getSubregistry(string) view returns(address)"]), functionName: "getSubregistry", args: ["eth"] });
  await client.request({ method: "anvil_impersonateAccount" as never, params: [d.ethRegistrar] as never });
  await client.request({ method: "anvil_setBalance" as never, params: [d.ethRegistrar, "0x3635c9adc5dea00000"] as never });
  const block = await client.getBlock();
  await client.waitForTransactionReceipt({ hash: await wallet.writeContract({ account: d.ethRegistrar, address: ethRegistry, abi: providerRegistryAbi, functionName: "register", args: ["providerfork402", admin, platform, zeroAddress, 1n << 20n, block.timestamp + 86400n * 30n] }) });
  // Symlink compiled artifacts into temporary working directory, keeping generated plans isolated.
  const { symlink } = await import("node:fs/promises");
  await symlink(resolve(cwd, "contracts"), resolve(dir, "contracts"));
  const run = () => new Promise<void>((ok, bad) => {
    const child = spawn(resolve(cwd, "node_modules/.bin/tsx"), [resolve(cwd, "scripts/provider-plan.ts"), "--with-service-registrar", ...(shared ? [] : ["--isolated-resolvers"])], { cwd: dir, env: { ...process.env, SEPOLIA_RPC_URL: `http://127.0.0.1:${port}`, ENS_PARENT_NAME: "providerfork402.eth", PROVIDER_LABEL: "alpha", PROVIDER_ADMIN_ADDRESS: admin, PLATFORM_REGISTRAR_ADDRESS: admin, PROVIDER_OPS_ADDRESS: ops, PROVIDER_TREASURY_SAFE_ADDRESS: treasury }, stdio: "inherit" });
    child.on("exit", code => code === 0 ? ok() : bad(Error(`planner ${code}`)));
  });
  const plan = async () => JSON.parse(await readFile(resolve(dir, "docs/setup/provider-alpha-transactions.json"), "utf8"));
  const send = async (tx: any) => client.waitForTransactionReceipt({ hash: await wallet.sendTransaction({ account: tx.signer, to: tx.to, data: tx.data, value: 0n }) });
  await run();
  let p = await plan(); assert.equal(p.transactions.length, 2);
  await send(p.transactions[0]); await run(); p = await plan(); assert.equal(p.transactions.length, 1);
  await send(p.transactions[0]); await run(); p = await plan(); assert.equal(p.transactions.length, 0);
  if (shared) {
    assert.equal(p.sharedResolver.transactions.length, 1);
    await send(p.sharedResolver.transactions[0]); await run(); p = await plan();
    assert.equal(p.sharedResolver.transactions.length, 5);
    for (const tx of p.sharedResolver.transactions) await send(tx);
    await run(); p = await plan(); assert.equal(p.sharedResolver.transactions.length, 0);
  }
  assert.equal(p.registrarPlan.verified, false);
  const receipt = await send(p.registrarPlan.transactions[0]);
  process.env.PROVIDER_SERVICE_REGISTRAR_ADDRESS = receipt.contractAddress!;
  await run(); p = await plan(); assert.equal(p.registrarPlan.verified, true); assert.equal(p.registrarPlan.transactions.length, shared ? 7 : 1);
  for (const tx of p.registrarPlan.transactions) await send(tx); await run(); p = await plan(); assert.equal(p.registrarPlan.transactions.length, 0);
  // Exercise the actual unsigned fixture planner against the configured registrar.
  const fixtureCheckpoint = await client.request({ method: "evm_snapshot" as never, params: [] as never });
  const fixturePath = resolve(dir, "fixtures.json");
  await writeFile(fixturePath, JSON.stringify({ services: [{ service: {
    name: "rates.alpha.providerfork402.eth", description: "Demo FX fixture", endpoint: "https://example.com/api/fx",
    paymentNetwork: "eip155:84532", assetAddress: "0x036cbd53842c5426634e7929541ec2318f3dcf7e", assetDecimals: 6,
    pricePerRequestAtomic: "10000", payTo: treasury, indexedBlock: "0", indexedAt: Number(block.timestamp),
    expiresAt: Number(block.timestamp + 86400n), status: "active", fixture: true,
    call: { method: "GET", fixture: true, example: {} },
  } }] }));
  await new Promise<void>((ok, bad) => {
    const child = spawn(resolve(cwd, "node_modules/.bin/tsx"), [resolve(cwd, "scripts/discovery-fixture-plan.ts"), fixturePath], {
      cwd: dir, env: { ...process.env, SEPOLIA_RPC_URL: `http://127.0.0.1:${port}`, PROVIDER_ENS_NAME: "alpha.providerfork402.eth", PROVIDER_REGISTRY_ADDRESS: p.registry, PROVIDER_RESOLVER_ADDRESS: p.sharedResolver.resolver, PROVIDER_ADMIN_ADDRESS: admin, PROVIDER_OPS_ADDRESS: ops, PROVIDER_TREASURY_SAFE_ADDRESS: treasury }, stdio: "inherit",
    });
    child.on("error", bad); child.on("exit", code => code === 0 ? ok() : bad(Error("Fixture planner failed")));
  });
  const fixtureFiles = await readdir(resolve(dir, ".local"));
  const fixturePlan = JSON.parse(await readFile(resolve(dir, ".local", fixtureFiles[0]!), "utf8"));
  const fixture = fixturePlan.plans[0];
  await send({ ...fixture.transactions[0], signer: admin });
  await client.request({ method: "evm_increaseTime" as never, params: [Number(fixture.revealAfterSeconds)] as never });
  await client.request({ method: "evm_mine" as never, params: [] as never });
  await send({ ...fixture.transactions[1], signer: admin });
  const fixtureCatalog = await snapshot(client, { roots: ["providerfork402.eth"], fromBlock: 11783987n, toBlock: await client.getBlockNumber({ cacheTime: 0 }) });
  assert.equal(fixtureCatalog.services[0]?.service.fixture, true);
  assert.equal(fixtureCatalog.services[0]?.service.name, "rates.alpha.providerfork402.eth");
  await client.request({ method: "evm_revert" as never, params: [fixtureCheckpoint] as never });
  console.log("PASS: unsigned fixture plan -> native commit/reveal -> indexed fixture records");
  const name = "weather.alpha.providerfork402.eth";
  const dns = bytesToHex(packetToBytes(name));
  const records = {
    "agent-endpoint[x402]": "https://weather.example/api",
    description: "Weather forecast",
    "ens402.status": "active",
    "ens402.call": JSON.stringify({ method: "GET", example: { city: "Tokyo" } }),
    "ens402.payment": JSON.stringify({ version: 2, scheme: "exact", network: "eip155:84532", asset: "0x036cbd53842c5426634e7929541ec2318f3dcf7e", payTo: treasury, pricing: { model: "fixed", amount: "10000", unit: "request" } }),
  };
  // Write before name registration, proving canonical export recovers pre-link records.
  for (const [key, value] of Object.entries(records)) await client.waitForTransactionReceipt({ hash: await wallet.writeContract({ account: admin, address: p.sharedResolver.resolver, abi: currentResolverAbi, functionName: "setText", args: [dns, key, value] }) });
  const latest = await client.getBlock();
  await client.waitForTransactionReceipt({ hash: await wallet.writeContract({ account: admin, address: p.registry, abi: providerRegistryAbi, functionName: "register", args: ["weather", admin, zeroAddress, p.sharedResolver.resolver, 1n << 24n, latest.timestamp + 1000n] }) });
  const snapshotBlock = await client.getBlockNumber({ cacheTime: 0 });
  const options = { roots: ["providerfork402.eth"], fromBlock: 11783987n, toBlock: snapshotBlock };
  const first = await snapshot(client, options);
  const second = await snapshot(client, options);
  assert.deepEqual(first, second);
  assert.equal(first.services.length, 1);
  assert.equal(first.services[0]!.service.description, "Weather forecast");
  const checkpoint = await client.request({ method: "evm_snapshot" as never, params: [] as never });
  await client.request({ method: "evm_increaseTime" as never, params: [2] as never });
  await client.waitForTransactionReceipt({ hash: await wallet.writeContract({ account: admin, address: p.sharedResolver.resolver, abi: currentResolverAbi, functionName: "setText", args: [dns, "description", "Changed"] }) });
  const changed = await snapshot(client, { ...options, toBlock: await client.getBlockNumber({ cacheTime: 0 }) });
  assert.equal(changed.services[0]!.service.description, "Changed");
  await client.request({ method: "evm_revert" as never, params: [checkpoint] as never });
  assert.deepEqual(await snapshot(client, options), first);
  await client.request({ method: "evm_increaseTime" as never, params: [1001] as never });
  await client.request({ method: "evm_mine" as never, params: [] as never });
  const expired = await snapshot(client, { ...options, toBlock: await client.getBlockNumber({ cacheTime: 0 }) });
  assert.equal(expired.services.length, 0);
  await verifyStore(first, changed, expired);
  console.log("PASS: identical block reconstruction, pre-link records, updates, rollback rebuild and expiry without an event");
  console.log(shared ? "SHARED RESOLVER" : "ISOLATED RESOLVERS");
  console.log("PASS: provider plan deployment, resume, native link, restricted registrar runtime verification and grant");
} finally { node.kill(); await rm(dir, { recursive: true, force: true }); }
