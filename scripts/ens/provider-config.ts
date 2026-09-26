import { encodeFunctionData, parseAbi, type Address } from "viem";
import { normalize } from "viem/ens";

/** Native registry roles, scoped separately to registry root and provider name. */
export const providerRoles = {
  registrar: 1n,
  registrarAdmin: 1n << 128n,
  // Pointer writes and their administration, renewal, and name transfer administration.
  name: (1n << 16n) | (1n << 20n) | (1n << 24n) |
    (((1n << 16n) | (1n << 20n) | (1n << 24n) | (1n << 28n)) << 128n),
} as const;
export const providerRegistryAbi = parseAbi([
  "function initialize((address account,uint256 roleBitmap)[] grants)",
  "function register(string label,address owner,address subregistry,address resolver,uint256 roles,uint64 expiry) returns(uint256)",
  "function findExpiry(string label) view returns(uint64)",
  "function hasRootRoles(uint256 roles,address account) view returns(bool)",
]);
export function providerLabel(value: string): string {
  const label = normalize(value.trim());
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    throw new Error("PROVIDER_LABEL must be a single ASCII label, 1 to 63 characters");
  return label;
}
export function providerInitialization(admin: Address) {
  return encodeFunctionData({ abi: providerRegistryAbi, functionName: "initialize",
    args: [[{ account: admin, roleBitmap: providerRoles.registrar | providerRoles.registrarAdmin }]] });
}
