import {
  keccak256,
  parseAbi,
  stringToHex,
  type Address,
  type PublicClient,
} from "viem";
import { sameAddress } from "../index";
import { recordKeys } from "./abi";

const abi = parseAbi([
  "function hasRoles(uint256 resource,uint256 roleBitmap,address account) view returns (bool)",
  "function hasRootRoles(uint256 roleBitmap,address account) view returns (bool)",
]);
/** Read actual effective native permissions at one block, including inherited root grants.
 * This checks the named wallets and text keys, not every holder or ancestor override.
 */
export async function auditTextPermissions(
  client: PublicClient,
  input: {
    resolver: Address;
    admin: Address;
    ops: Address;
    treasury: Address;
  },
) {
  if ((await client.getChainId()) !== 11155111)
    throw new Error("ENS permissions require Sepolia");
  if (
    sameAddress(input.admin, input.ops) ||
    sameAddress(input.ops, input.treasury)
  )
    throw new Error("Ops must be separate from Admin and Treasury");
  const block = await client.getBlock();
  const checks = await Promise.all(
    (["admin", "ops", "treasury"] as const).flatMap((wallet) => {
      const root =
        wallet === "admin" || sameAddress(input[wallet], input.admin);
      return [
        ...recordKeys.map((key) => ({
          key,
          role: 16n,
          expected:
            root ||
            (wallet === "ops"
              ? ["agent-endpoint[x402]", "description", "avatar", "ens402.call"].includes(key)
              : key === "ens402.payment"),
        })),
        { key: "root:text", role: 16n, expected: root },
        { key: "root:admin", role: 16n << 128n, expected: root },
        ...recordKeys.map((key) => ({
          key: `admin:${key}`,
          role: 16n << 128n,
          expected: root,
        })),
      ].map(async ({ key, role, expected }) => {
        const isRoot = key.startsWith("root:");
        const resourceKey = key.startsWith("admin:") ? key.slice(6) : key;
        const actual = isRoot
          ? await client.readContract({
              address: input.resolver,
              abi,
              functionName: "hasRootRoles",
              args: [role, input[wallet]],
              blockNumber: block.number,
            })
          : await client.readContract({
              address: input.resolver,
              abi,
              functionName: "hasRoles",
              args: [
                BigInt(keccak256(stringToHex(resourceKey))),
                role,
                input[wallet],
              ],
              blockNumber: block.number,
            });
        return {
          wallet,
          address: input[wallet],
          key,
          expected,
          actual,
          passed: actual === expected,
        };
      });
    }),
  );
  return {
    resolver: input.resolver,
    block: String(block.number),
    blockHash: block.hash,
    passed: checks.every((c) => c.passed),
    checks,
    scope:
      "Named-wallet effective text permissions only. Registry, ancestor, other-holder and future grant changes require separate review.",
  };
}
