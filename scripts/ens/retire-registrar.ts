import {
  encodeFunctionData,
  keccak256,
  parseAbi,
  stringToHex,
  type Address,
  type PublicClient,
} from "viem";
import { sharedKeys } from "./provider-shared";
const abi = parseAbi([
  "function hasRootRoles(uint256 roles,address account) view returns(bool)",
  "function revokeRootRoles(uint256 roles,address account) returns(bool)",
  "function hasRoles(uint256 resource,uint256 roles,address account) view returns(bool)",
  "function revokeRoles(uint256 resource,uint256 roles,address account) returns(bool)",
]);
/** Revoke the retired publisher after its replacement is ready. Never revoke human delegates. */
export async function retireRegistrarPlan(
  client: PublicClient,
  admin: Address,
  registry: Address,
  resolver: Address,
  retired: Address,
  blockNumber: bigint,
) {
  const transactions: Array<{
    signer: Address;
    to: Address;
    data: `0x${string}`;
    value: string;
    description: string;
  }> = [];
  if (
    await client.readContract({
      address: registry,
      abi,
      functionName: "hasRootRoles",
      args: [1n, retired],
      blockNumber,
    })
  )
    transactions.push({
      signer: admin,
      to: registry,
      value: "0x0",
      data: encodeFunctionData({
        abi,
        functionName: "revokeRootRoles",
        args: [1n, retired],
      }),
      description:
        "Remove the previous publisher's service registration permission",
    });
  for (const key of sharedKeys) {
    const resource = BigInt(keccak256(stringToHex(key)));
    if (
      await client.readContract({
        address: resolver,
        abi,
        functionName: "hasRoles",
        args: [resource, 16n, retired],
        blockNumber,
      })
    )
      transactions.push({
        signer: admin,
        to: resolver,
        value: "0x0",
        data: encodeFunctionData({
          abi,
          functionName: "revokeRoles",
          args: [resource, 16n, retired],
        }),
        description: `Remove the previous publisher's ${key} permission`,
      });
  }
  return transactions;
}
