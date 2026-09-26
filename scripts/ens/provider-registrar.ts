import { readFile } from "node:fs/promises";
import { bytesToHex, encodeDeployData, encodeFunctionData, keccak256, parseAbi, type Address, type Hex, type PublicClient } from "viem";
import { sharedKeys, sharedSetterPlan } from "./provider-shared";
import { namehash, packetToBytes } from "viem/ens";
import { currentDeployment } from "../../packages/sdk/src/ens/current";

/** Compare compiler runtime bytecode while ignoring constructor-patched immutable slots. */
export function matchesRuntime(actual: Hex, template: Hex, references: Record<string, { start: number; length: number }[]>): boolean {
  if (actual.length !== template.length) return false;
  const left = actual.slice(2).toLowerCase().split("");
  const right = template.slice(2).toLowerCase().split("");
  for (const range of Object.values(references).flat()) {
    if (range.start < 0 || range.length <= 0 || (range.start + range.length) * 2 > left.length) return false;
    left.fill("0", range.start * 2, (range.start + range.length) * 2);
    right.fill("0", range.start * 2, (range.start + range.length) * 2);
  }
  return left.join("") === right.join("");
}

/** Only emits grants after verifying the restricted variant runtime and every constructor setting. */
export async function providerRegistrarPlan(client: PublicClient, admin: Address, registry: Address, name: string, expiry: bigint, blockNumber: bigint, existing?: Address, shared?: Address, ops?: Address, treasury?: Address) {
  if (shared && (!ops || !treasury)) throw Error("Shared registrar requires pinned Ops and Treasury Safe");
  const variant = shared ? "SharedProviderServiceRegistrar" : "ProviderServiceRegistrar";
  const artifact = JSON.parse(await readFile(`contracts/out/${variant}.sol/${variant}.json`, "utf8"));
  const deployment = currentDeployment;
  const dns = bytesToHex(packetToBytes(name));
  if (!existing) return {
    artifact: variant, creationBytecodeHash: keccak256(artifact.bytecode.object),
    transactions: [{ signer: admin, value: "0x0", data: encodeDeployData({ abi: artifact.abi,
      bytecode: artifact.bytecode.object, args: [registry, deployment.factory, deployment.resolverImplementation, dns, expiry, ...(shared ? [shared, ops!, treasury!] : [])] }),
      description: "Deploy restricted ProviderServiceRegistrar; save receipt contractAddress as PROVIDER_SERVICE_REGISTRAR_ADDRESS and rerun before granting rights" }],
    verified: false,
  };
  const code = await client.getCode({ address: existing, blockNumber });
  if (!code || !matchesRuntime(code, artifact.deployedBytecode.object, artifact.deployedBytecode.immutableReferences ?? {}))
    throw new Error("Registrar runtime does not match the compiled restricted ProviderServiceRegistrar artifact");
  const abi = parseAbi([
    "function sharedResolver() view returns(address)", "function providerOps() view returns(address)", "function treasurySafe() view returns(address)",
    "function registry() view returns(address)", "function factory() view returns(address)",
    "function resolverImplementation() view returns(address)", "function parentDNS() view returns(bytes)",
    "function parentNode() view returns(bytes32)", "function currentResolver() view returns(bool)",
    "function registrationExpiry() view returns(uint64)",
    "function hasRootRoles(uint256 roles,address account) view returns(bool)",
    "function grantRootRoles(uint256 roles,address account) returns(bool)",
  ]);
  for (const [functionName, expected] of [
    ["registry", registry], ["factory", deployment.factory], ["resolverImplementation", deployment.resolverImplementation],
    ["parentDNS", dns], ["parentNode", namehash(name)], ["currentResolver", true], ["registrationExpiry", expiry],
  ] as const) {
    const actual = await client.readContract({ address: existing, abi, functionName, blockNumber });
    if (String(actual).toLowerCase() !== String(expected).toLowerCase()) throw new Error(`Registrar ${functionName} differs from provider plan`);
  }
  if (shared) for (const [functionName, expected] of [["sharedResolver", shared], ["providerOps", ops!], ["treasurySafe", treasury!]] as const) {
    const actual = await client.readContract({ address: existing, abi, functionName, blockNumber });
    if (actual.toLowerCase() !== expected.toLowerCase()) throw Error(`Registrar ${functionName} differs`);
  }
  const setterTransactions = shared ? await sharedSetterPlan(client, shared, admin, existing, sharedKeys, name, blockNumber) : [];
  const granted = await client.readContract({ address: registry, abi, functionName: "hasRootRoles", args: [1n, existing], blockNumber });
  return { artifact: variant, runtimeCodeHash: keccak256(code), registrar: existing, verified: true,
    transactions: [...setterTransactions, ...(granted ? [] : [{ signer: admin, to: registry, value: "0x0",
      data: encodeFunctionData({ abi, functionName: "grantRootRoles", args: [1n, existing] }),
      description: "Grant ROLE_REGISTRAR to verified restricted ProviderServiceRegistrar" }])],
  };
}
