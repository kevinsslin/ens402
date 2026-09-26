import { bytesToHex, encodeFunctionData, keccak256, parseAbi, stringToHex, type Address, type PublicClient } from "viem";
import { packetToBytes } from "viem/ens";
import { currentDeployment, currentResolverAbi } from "../../packages/sdk/src/ens/current";
import { factoryAbi } from "../../packages/sdk/src/ens/abi";
export const sharedKeys = ["agent-endpoint[x402]", "description", "avatar", "ens402.call", "ens402.payment", "ens402.status"] as const;
const permissions = parseAbi([
  "function hasRoles(uint256 resource,uint256 roles,address account) view returns(bool)",
  "function hasRootRoles(uint256 roles,address account) view returns(bool)",
]);
export async function sharedSetterPlan(client: PublicClient, resolver: Address, admin: Address, account: Address, keys: readonly string[], name: string, blockNumber: bigint) {
  for (const bit of [4n, 28n, 124n]) for (const shift of [0n, 128n]) {
    if (await client.readContract({ address: resolver, abi: permissions, functionName: "hasRootRoles", args: [1n << (bit + shift), account], blockNumber }))
      throw Error("Shared resolver delegate has broad text, linking, upgrade or administration rights");
  }
  const txs = [];
  for (const key of sharedKeys) {
    const resource = BigInt(keccak256(stringToHex(key)));
    if (await client.readContract({ address: resolver, abi: permissions, functionName: "hasRoles", args: [resource, 16n << 128n, account], blockNumber }))
      throw Error("Shared resolver delegate unexpectedly has text administration");
    const has = await client.readContract({ address: resolver, abi: permissions, functionName: "hasRoles", args: [resource, 16n, account], blockNumber });
    if (has && !keys.includes(key)) throw Error(`Delegate unexpectedly controls ${key}`);
    if (!has && keys.includes(key)) txs.push({ signer: admin, to: resolver, value: "0x0",
      data: encodeFunctionData({ abi: currentResolverAbi, functionName: "grantSetterRoles", args: [encodeFunctionData({ abi: currentResolverAbi, functionName: "setText", args: [bytesToHex(packetToBytes(name)), key, ""] }), account] }),
      description: `Grant ${key} writer across this provider resolver to ${account}` });
  }
  return txs;
}
export async function sharedResolverPlan(client: PublicClient, admin: Address, ops: Address, treasury: Address, name: string, salt: bigint, blockNumber: bigint, existing?: Address) {
  if (new Set([admin, ops, treasury].map(a => a.toLowerCase())).size !== 3) throw Error("Provider Admin, Ops and Treasury Safe must be distinct");
  const safeCode = await client.getCode({ address: treasury, blockNumber });
  if (!safeCode || safeCode === "0x") throw Error("PROVIDER_TREASURY_SAFE_ADDRESS must be a deployed Sepolia contract; verify Safe owners/threshold separately");
  const d = currentDeployment;
  const code = existing && await client.getCode({ address: existing, blockNumber });
  if (!code || code === "0x") {
    const init = encodeFunctionData({ abi: currentResolverAbi, functionName: "initialize", args: [[{ account: admin, roleBitmap: 16n | (16n << 128n) }], []] });
    const { result } = await client.simulateContract({ account: admin, address: d.factory, abi: factoryAbi, functionName: "deployProxy", args: [d.resolverImplementation, salt, init] });
    if (existing && existing.toLowerCase() !== result.toLowerCase()) throw Error("Shared resolver prediction changed");
    return { resolver: result, salt: String(salt), transactions: [{ signer: admin, to: d.factory, value: "0x0", data: encodeFunctionData({ abi: factoryAbi, functionName: "deployProxy", args: [d.resolverImplementation, salt, init] }), description: "Deploy shared native provider resolver with Provider Admin text governance" }] };
  }
  const implementation = await client.readContract({ address: d.factory, abi: factoryAbi, functionName: "verifyContract", args: [existing!], blockNumber });
  if (implementation.toLowerCase() !== d.resolverImplementation.toLowerCase()) throw Error("Shared resolver implementation differs");
  if (!await client.readContract({ address: existing!, abi: permissions, functionName: "hasRootRoles", args: [16n | (16n << 128n), admin], blockNumber })) throw Error("Provider Admin resolver governance missing");
  return { resolver: existing!, salt: String(salt), transactions: [
    ...await sharedSetterPlan(client, existing!, admin, ops, sharedKeys.slice(0, 4), name, blockNumber),
    ...await sharedSetterPlan(client, existing!, admin, treasury, ["ens402.payment"], name, blockNumber),
  ] };
}
