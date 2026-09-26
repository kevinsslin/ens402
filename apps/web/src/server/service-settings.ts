import {
  isAddress,
  parseAbi,
  keccak256,
  stringToHex,
  encodeFunctionData,
  zeroAddress,
  type Address,
} from "viem";
import { normalize } from "viem/ens";
import { ensClient } from "@ens402/server";
import {
  currentDeployment,
  currentRegistryAbi,
  resolveCurrentService,
} from "../../../../packages/sdk/src/ens/current";
import { prepareRecordUpdate, recordKeys } from "@ens402/sdk/ens";
import { prepareSetupStep } from "./setup-transaction";
const rolesAbi = parseAbi([
  "function hasRoles(uint256 resource,uint256 roleBitmap,address account) view returns(bool)",
]);
/** Editor discovery does not approve a service for payment. Native simulation enforces every write. */
export async function readServiceSettings(nameInput: string, wallet: string) {
  const name = normalize(nameInput);
  if (!name.endsWith(".eth") || name.length > 255 || !isAddress(wallet))
    throw Error("Enter a service ENS name and connect a wallet");
  const client = ensClient();
  const block = await client.getBlock();
  const labels = name.split(".");
  let registry: Address = currentDeployment.rootRegistry;
  for (const label of labels.slice(1).reverse()) {
    registry = await client.readContract({
      address: registry,
      abi: currentRegistryAbi,
      functionName: "getSubregistry",
      args: [label],
      blockNumber: block.number,
    });
    if (registry === zeroAddress)
      throw Error("This service namespace is not configured");
  }
  const resolver = await client.readContract({
    address: registry,
    abi: currentRegistryAbi,
    functionName: "getResolver",
    args: [labels[0]!],
    blockNumber: block.number,
  });
  const service = await resolveCurrentService(client, name, undefined, {
    mode: "provider-shared",
    providerName: labels.slice(1).join("."),
    providerRegistry: registry,
    resolver,
  });
  const permissions = await Promise.all(
    recordKeys.map(async (key) => ({
      key,
      canWrite: await client.readContract({
        address: service.resolver,
        abi: rolesAbi,
        functionName: "hasRoles",
        args: [BigInt(keccak256(stringToHex(key))), 16n, wallet as Address],
        blockNumber: BigInt(service.block),
      }),
    })),
  );
  return { service, permissions };
}
export async function prepareServiceSettings(input: {
  name: string;
  wallet: string;
  changes: Array<{ key: string; value: string }>;
}) {
  if (
    !Array.isArray(input.changes) ||
    !input.changes.length ||
    input.changes.length > 6 ||
    new Set(input.changes.map((c) => c.key)).size !== input.changes.length
  )
    throw Error("Select one or more changed settings");
  const { service, permissions } = await readServiceSettings(
    input.name,
    input.wallet,
  );
  const calls = input.changes.map((change) => {
    const key = recordKeys.find((k) => k === change.key);
    if (!key || typeof change.value !== "string")
      throw Error("Unsupported setting");
    if (!permissions.find((p) => p.key === key)?.canWrite)
      throw Error(
        `This wallet cannot update ${key}. Switch to its Operations, Treasury Admin or Resolver Admin wallet.`,
      );
    return prepareRecordUpdate(service, key, change.value);
  });
  return prepareSetupStep({
    signer: input.wallet,
    to: service.resolver,
    value: "0x0",
    data:
      calls.length === 1
        ? calls[0]!.data
        : encodeFunctionData({
            abi: parseAbi([
              "function multicall(bytes[] calls) returns(bytes[])",
            ]),
            functionName: "multicall",
            args: [calls.map((c) => c.data)],
          }),
    description: `Update ${calls.length} service settings`,
    actions: calls.map((c) => c.description),
  });
}
