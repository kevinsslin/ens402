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
  const broadRoles = [4n, 28n, 124n].flatMap(bit => [0n, 128n].map(shift => 1n << (bit + shift)));
  const [broad, scoped] = await Promise.all([
    Promise.all(broadRoles.map(role => client.readContract({ address: resolver, abi: permissions, functionName: "hasRootRoles", args: [role, account], blockNumber }))),
    Promise.all(sharedKeys.map(async key => {
      const resource = BigInt(keccak256(stringToHex(key)));
      const [adminRole, setter] = await Promise.all([
        client.readContract({ address: resolver, abi: permissions, functionName: "hasRoles", args: [resource, 16n << 128n, account], blockNumber }),
        client.readContract({ address: resolver, abi: permissions, functionName: "hasRoles", args: [resource, 16n, account], blockNumber }),
      ]);
      return { key, adminRole, setter };
    })),
  ]);
  if (broad.some(Boolean)) throw Error("Shared resolver delegate has broad text, linking, upgrade or administration rights");
  const txs = [];
  for (const { key, adminRole, setter } of scoped) {
    if (adminRole) throw Error("Shared resolver delegate unexpectedly has text administration");
    if (setter && !keys.includes(key)) throw Error(`Delegate unexpectedly controls ${key}`);
    if (!setter && keys.includes(key)) txs.push({ signer: admin, to: resolver, value: "0x0",
      data: encodeFunctionData({ abi: currentResolverAbi, functionName: "grantSetterRoles", args: [encodeFunctionData({ abi: currentResolverAbi, functionName: "setText", args: [bytesToHex(packetToBytes(name)), key, ""] }), account] }),
      description: `Grant ${key} writer across this provider resolver to ${account}` });
  }
  return txs;
}
export async function sharedResolverPlan(client: PublicClient, admin: Address, ops: Address, treasury: Address, name: string, salt: bigint, blockNumber: bigint, existing?: Address) {
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
  const delegates = new Map<string, { account: Address; keys: string[] }>();
  for (const [account, keys] of [[ops, sharedKeys.slice(0, 4)], [treasury, ["ens402.payment"]]] as const) {
    // Admin already has root text authority. Other overlapping roles receive their key union.
    if (account.toLowerCase() === admin.toLowerCase()) continue;
    const entry = delegates.get(account.toLowerCase()) ?? { account, keys: [] };
    entry.keys.push(...keys);
    delegates.set(account.toLowerCase(), entry);
  }
  const transactions = (await Promise.all([...delegates.values()].map(({ account, keys }) =>
    sharedSetterPlan(client, existing!, admin, account, keys, name, blockNumber),
  ))).flat();
  return { resolver: existing!, salt: String(salt), transactions };
}
