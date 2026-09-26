import { isAddress, parseAbi, zeroAddress, type Address } from "viem";
import { normalize } from "viem/ens";
import { ensClient } from "@ens402/server";
import { currentDeployment, currentRegistryAbi } from "@ens402/sdk/ens";
import { factoryAbi } from "@ens402/sdk/ens";
const abi = parseAbi([
  "event LabelRegistered(uint256 indexed tokenId,bytes32 indexed labelHash,string label,address owner,uint64 expiry,address indexed sender)",
  "function hasRootRoles(uint256 roles,address account) view returns(bool)",
  "function findExpiry(string label) view returns(uint64)",
]);
const births = new Map<string, bigint>();
/** Discover names from registration events, then check current ownership and roles.
 * No account database or browser cache is used as proof of authority.
 */
export async function providerDirectory(wallet: string, client = ensClient()) {
  if (!isAddress(wallet, { strict: false }) || wallet.toLowerCase() === zeroAddress) throw Error("Connect a valid wallet");
  const parent = normalize(process.env.ENS_PARENT_NAME || "ens402.eth");
  const block = await client.getBlock();
  let registry: Address = currentDeployment.rootRegistry;
  let platformOwner: Address = zeroAddress;
  for (const label of parent.split(".").reverse()) {
    platformOwner = await client.readContract({ address: registry, abi: currentRegistryAbi, functionName: "findOwner", args: [label], blockNumber: block.number });
    const expiry = await client.readContract({ address: registry, abi, functionName: "findExpiry", args: [label], blockNumber: block.number });
    if (platformOwner === zeroAddress || expiry <= block.timestamp) throw Error("The platform name needs registration or renewal");
    registry = await client.readContract({ address: registry, abi: currentRegistryAbi, functionName: "getSubregistry", args: [label], blockNumber: block.number });
    if (registry === zeroAddress) return { parent, platformOwner, platformReady: false, providers: [], observedBlock: String(block.number) };
  }
  const platformImplementation = await client.readContract({ address: currentDeployment.factory, abi: factoryAbi, functionName: "verifyContract", args: [registry], blockNumber: block.number });
  if (platformImplementation.toLowerCase() !== currentDeployment.registryImplementation.toLowerCase()) throw Error("Unsupported platform registry");
  // Locate this registry's deployment so newly registered providers are visible
  // before service indexing. Archive RPC failure is an error, never an empty list.
  let from = births.get(registry.toLowerCase());
  if (from === undefined) {
    let low = block.number, high = block.number;
    const code = await client.getCode({ address: registry, blockNumber: high });
    if (!code || code === "0x") throw Error("Platform registry has no code");
    // Search backwards from the head; demo RPCs need not retain years of state.
    for (let distance = 128n; ; distance *= 2n) {
      low = block.number > distance ? block.number - distance : 0n;
      const prior = await client.getCode({ address: registry, blockNumber: low });
      if (!prior || prior === "0x") break;
      if (low === 0n || distance >= 200_000n) throw Error("Provider history exceeds the demo scan window");
      high = low;
    }
    while (low < high) {
      const middle = (low + high) / 2n;
      const code = await client.getCode({ address: registry, blockNumber: middle });
      if (code && code !== "0x") high = middle; else low = middle + 1n;
    }
    from = low;
    births.set(registry.toLowerCase(), from);
  }
  if (block.number - from > 200_000n) throw Error("Provider history exceeds the demo scan window. Open a known provider from the merchant dashboard.");
  const labels = new Set<string>();
  for (let start = from; start <= block.number; start += 5000n) {
    const logs = await client.getLogs({ address: registry, event: abi[0], fromBlock: start, toBlock: start + 4999n < block.number ? start + 4999n : block.number, strict: true });
    for (const log of logs) if (log.args.label) labels.add(log.args.label);
    if (labels.size > 100) throw Error("Provider directory exceeds the demo scan limit. Open a known provider from the merchant dashboard.");
  }
  const providers = [];
  for (const label of labels) {
    const [owner, child, expiry] = await Promise.all([
      client.readContract({ address: registry, abi: currentRegistryAbi, functionName: "findOwner", args: [label], blockNumber: block.number }),
      client.readContract({ address: registry, abi: currentRegistryAbi, functionName: "getSubregistry", args: [label], blockNumber: block.number }),
      client.readContract({ address: registry, abi, functionName: "findExpiry", args: [label], blockNumber: block.number }),
    ]);
    if (owner === zeroAddress || child === zeroAddress || expiry <= block.timestamp) continue;
    const implementation = await client.readContract({ address: currentDeployment.factory, abi: factoryAbi, functionName: "verifyContract", args: [child], blockNumber: block.number });
    if (implementation.toLowerCase() !== currentDeployment.registryImplementation.toLowerCase()) continue;
    const canPublish = await client.readContract({ address: child, abi, functionName: "hasRootRoles", args: [1n, wallet as Address], blockNumber: block.number });
    const isOwner = owner.toLowerCase() === wallet.toLowerCase();
    if (isOwner || canPublish) providers.push({ name: `${label}.${parent}`, owner, registry: child, role: isOwner ? "Provider owner" : "Service registrar" });
  }
  return { parent, platformOwner, platformReady: true, providers, observedBlock: String(block.number) };
}
