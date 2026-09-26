import { parseCallMetadata } from "../../packages/sdk/src/call";
import { decodeFunctionResult, encodeFunctionData, bytesToHex, keccak256, parseAbi, zeroAddress, type Address, type PublicClient } from "viem";
import { namehash, normalize, packetToBytes } from "viem/ens";
import { currentDeployment as d, currentRegistryAbi, currentResolverAbi } from "../../packages/sdk/src/ens/current";
import { factoryAbi, universalAbi } from "../../packages/sdk/src/ens/abi";
import { parsePaymentRecord, validateDescription, validateEndpoint } from "../../packages/sdk/src/ens/index";
import { validateDiscoveryService, type DiscoveryService } from "../../packages/sdk/src/discovery";
const registryAbi = parseAbi([
  "event LabelRegistered(uint256 indexed tokenId,bytes32 indexed labelHash,string label,address owner,uint64 expiry,address indexed sender)",
  "function findExpiry(string label) view returns(uint64)",
]);
const textAbi = parseAbi(["function text(bytes32 node,string key) view returns(string)"]);
export type SnapshotOptions = { roots: string[]; fromBlock: bigint; toBlock: bigint; chunkSize?: bigint; maxNames?: number; candidates?: Record<string, string[]> };

/** Rebuild current catalog from public registration logs plus block-pinned authoritative reads.
 * Dynamic link changes, prior-to-link writes and token regeneration are resolved from current state.
 * A fresh rebuild is also the rollback strategy: no events from an orphaned snapshot are reused.
 */
export async function snapshot(client: PublicClient, options: SnapshotOptions) {
  if (await client.getChainId() !== 11155111) throw Error("Indexer supports ENS Sepolia only");
  if (options.fromBlock < 0n || options.toBlock < options.fromBlock) throw Error("Invalid snapshot interval");
  const head = await client.getBlock({ blockNumber: options.toBlock });
  if (!head.hash) throw Error("Missing canonical block hash");
  for (const [address, expected] of [[d.factory, d.factoryCodeHash], [d.resolverImplementation, d.resolverImplementationCodeHash], [d.universalResolver, d.universalResolverCodeHash]] as const) {
    const code = await client.getCode({ address, blockNumber: options.toBlock });
    if (!code || keccak256(code) !== expected) throw Error("Pinned ENS deployment changed");
  }
  const roots = [...new Set(options.roots.map(normalize))].sort();
  if (!roots.length || roots.some(n => !n.endsWith(".eth"))) throw Error("Supply supported full .eth roots");
  const rows = new Map<string, DiscoveryService>();
  const excluded: { name: string; reason: string }[] = [];
  let visitedNames = 0;
  const blockNumber = options.toBlock;
  const visited = new Set<string>();
  const min = (a: bigint, b: bigint) => a < b ? a : b;
  async function walk(registry: Address, parent: string, ancestorExpiry: bigint, path: Set<string>) {
    if (path.has(registry.toLowerCase())) throw Error("Registry cycle detected");
    if (path.size > 16) throw Error("Registry depth exceeds supported scope");
    const visit = `${registry.toLowerCase()}:${parent}`;
    if (visited.has(visit)) return;
    visited.add(visit);
    const implementation = await client.readContract({ address: d.factory, abi: factoryAbi, functionName: "verifyContract", args: [registry], blockNumber });
    if (implementation.toLowerCase() !== d.registryImplementation.toLowerCase()) throw Error("Unsupported registry in configured namespace");
    const labels = new Set<string>(options.candidates?.[registry.toLowerCase()] ?? []);
    // Starting before the supported root's creation is mandatory. Scanning each discovered
    // registry from this bound also recovers names created before its parent linked it.
    const step = options.chunkSize ?? 2000n;
    if (step < 1n) throw Error("Invalid log chunk size");
    if (!options.candidates) for (let start = options.fromBlock; start <= blockNumber; start += step) {
      const logs = await client.getLogs({ address: registry, event: registryAbi[0], fromBlock: start, toBlock: min(start + step - 1n, blockNumber), strict: true });
      for (const log of logs) labels.add(log.args.label);
    }
    const nextPath = new Set(path).add(registry.toLowerCase());
    for (const label of [...labels].sort()) {
      const name = `${label}.${parent}`;
      if (++visitedNames > (options.maxNames ?? 10000)) throw Error("Snapshot scope exceeded; refusing partial catalog");
      const owner = await client.readContract({ address: registry, abi: currentRegistryAbi, functionName: "findOwner", args: [label], blockNumber });
      const expiry = min(ancestorExpiry, await client.readContract({ address: registry, abi: registryAbi, functionName: "findExpiry", args: [label], blockNumber }));
      if (owner === zeroAddress || expiry <= head.timestamp) continue;
      const child = await client.readContract({ address: registry, abi: currentRegistryAbi, functionName: "getSubregistry", args: [label], blockNumber });
      if (child !== zeroAddress) await walk(child, name, expiry, nextPath);
      const resolver = await client.readContract({ address: registry, abi: currentRegistryAbi, functionName: "getResolver", args: [label], blockNumber });
      if (resolver === zeroAddress) continue;
      const node = namehash(name);
      const [exact, resolvedNode, offset] = await client.readContract({ address: d.universalResolver, abi: universalAbi, functionName: "findResolver", args: [bytesToHex(packetToBytes(name))], blockNumber });
      if (offset !== 0n || resolvedNode !== node || exact.toLowerCase() !== resolver.toLowerCase()) { excluded.push({ name, reason: "not-exact-resolver" }); continue; }
      const implementation = await client.readContract({ address: d.factory, abi: factoryAbi, functionName: "verifyContract", args: [resolver], blockNumber });
      if (implementation.toLowerCase() !== d.resolverImplementation.toLowerCase()) { excluded.push({ name, reason: "unsupported-resolver" }); continue; }
      const recordId = await client.readContract({ address: resolver, abi: currentResolverAbi, functionName: "getRecordId", args: [node], blockNumber });
      if (recordId === 0n) { excluded.push({ name, reason: "missing-explicit-record" }); continue; }
      // Network/RPC errors abort the entire snapshot; only invalid public records are excluded.
      const values = await Promise.all(["agent-endpoint[x402]", "description", "ens402.payment", "ens402.status", "ens402.call"].map(async key => {
        const [data, usedResolver] = await client.readContract({ address: d.universalResolver, abi: universalAbi, functionName: "resolve", args: [bytesToHex(packetToBytes(name)), encodeFunctionData({ abi: textAbi, functionName: "text", args: [node, key] })], blockNumber });
        if (usedResolver.toLowerCase() !== resolver.toLowerCase()) throw Error("Resolver changed during read");
        return decodeFunctionResult({ abi: textAbi, functionName: "text", data });
      }));
      try {
        const payment = parsePaymentRecord(values[2]!);
        if (payment.version !== 2) throw Error("fixed-price-required");
        if (values[3] !== "active" && values[3] !== "suspended") throw Error("invalid-status");
        if (!values[4]) throw Error("missing-public-call-schema");
        const call = parseCallMetadata(values[4]);
        const service: DiscoveryService = { name, description: validateDescription(values[1]!), endpoint: validateEndpoint(values[0]!), paymentNetwork: payment.network, assetAddress: payment.asset, pricePerRequestAtomic: payment.pricing.amount, assetDecimals: 6, payTo: payment.payTo, indexedBlock: String(blockNumber), indexedAt: Number(head.timestamp), expiresAt: Number(expiry), status: values[3], fixture: call.fixture ?? false, call };
        validateDiscoveryService(service); rows.set(name, service);
      } catch (error) { excluded.push({ name, reason: (error as Error).message }); }
    }
  }
  for (const root of roots) {
    let registry: Address = d.rootRegistry;
    let expiry = (1n << 64n) - 1n;
    for (const label of root.split(".").reverse()) {
      const owner = await client.readContract({ address: registry, abi: currentRegistryAbi, functionName: "findOwner", args: [label], blockNumber });
      expiry = min(expiry, await client.readContract({ address: registry, abi: registryAbi, functionName: "findExpiry", args: [label], blockNumber }));
      if (owner === zeroAddress || expiry <= head.timestamp) throw Error(`Supported root/ancestor inactive: ${root}`);
      registry = await client.readContract({ address: registry, abi: currentRegistryAbi, functionName: "getSubregistry", args: [label], blockNumber });
      if (registry === zeroAddress) throw Error(`Supported root not linked: ${root}`);
    }
    await walk(registry, root, expiry, new Set());
  }
  if ((await client.getBlock({ blockNumber })).hash !== head.hash) throw Error("Reorganization during snapshot; retry from canonical state");
  return { source: { id: `ens402-sepolia:${roots.join(",")}`, roots, updatedAt: Number(head.timestamp), kind: "indexer" as const },
    checkpoint: { chainId: 11155111 as const, fromBlock: String(options.fromBlock), blockNumber: String(blockNumber), blockHash: head.hash, rawScope: "registered descendants of configured roots" },
    services: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)).map(service => ({ service })), excluded };
}
