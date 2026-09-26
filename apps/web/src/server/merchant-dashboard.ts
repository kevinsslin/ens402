import { isDeepStrictEqual } from "node:util";
import {
  type Address,
  parseAbi,
  zeroAddress,
  keccak256,
  stringToHex,
} from "viem";
import { normalize } from "viem/ens";
import {
  currentDeployment,
  currentRegistryAbi,
  resolveCurrentService,
} from "../../../../packages/sdk/src/ens/current";
import { factoryAbi } from "@ens402/sdk/ens";
import { ensClient } from "@ens402/server";
import { DiscoveryNotReadyError } from "@ens402/server/discovery";
import { configuredDiscovery } from "@ens402/server/discovery-runtime";
const accessAbi = parseAbi([
  "function hasRoles(uint256 resource,uint256 roleBitmap,address account) view returns(bool)",
  "function hasRootRoles(uint256 roleBitmap,address account) view returns(bool)",
  "function findExpiry(string label) view returns(uint64)",
]);
const keys = [
  "agent-endpoint[x402]",
  "description",
  "avatar",
  "ens402.call",
  "ens402.payment",
  "ens402.status",
];
/** Public observed permissions, not authentication. Every mutation still requires the connected wallet signature. */
export async function merchantDashboard(
  providerInput: string,
  walletInput: string,
  pendingInput?: string,
  sharedResolverInput?: string,
) {
  const provider = normalize(providerInput);
  if (
    !/^[a-z0-9.-]+\.eth$/.test(provider) ||
    provider.length > 255 ||
    !/^0x[0-9a-fA-F]{40}$/.test(walletInput)
  )
    throw Error("Use a provider ENS name and connected wallet address");
  const wallet = walletInput as Address;
  const client = ensClient();
  const block = await client.getBlock();
  let registry: Address = currentDeployment.rootRegistry;
  let owner: Address = zeroAddress;
  let nameRegistry: Address = registry;
  for (const label of provider.split(".").reverse()) {
    nameRegistry = registry;
    owner = await client.readContract({
      address: registry,
      abi: currentRegistryAbi,
      functionName: "findOwner",
      args: [label],
      blockNumber: block.number,
    });
    if (owner === zeroAddress)
      throw Error("Provider or ancestor is not registered");
    registry = await client.readContract({
      address: registry,
      abi: currentRegistryAbi,
      functionName: "getSubregistry",
      args: [label],
      blockNumber: block.number,
    });
    if (registry === zeroAddress)
      throw Error("Provider registry is not configured");
  }
  const implementation = await client.readContract({
    address: currentDeployment.factory,
    abi: factoryAbi,
    functionName: "verifyContract",
    args: [registry],
    blockNumber: block.number,
  });
  if (implementation.toLowerCase() !== currentDeployment.registryImplementation)
    throw Error("Unsupported provider registry");
  const sharedHint =
    sharedResolverInput ||
    (process.env.PROVIDER_ENS_NAME === provider
      ? process.env.PROVIDER_RESOLVER_ADDRESS
      : undefined);
  let sharedResolver: Address | undefined;
  if (sharedHint) {
    if (
      !/^0x[0-9a-fA-F]{40}$/.test(sharedHint) ||
      sharedHint.toLowerCase() === zeroAddress
    )
      throw Error("Invalid shared resolver");
    sharedResolver = sharedHint as Address;
    const resolverImpl = await client.readContract({
      address: currentDeployment.factory,
      abi: factoryAbi,
      functionName: "verifyContract",
      args: [sharedResolver],
      blockNumber: block.number,
    });
    if (resolverImpl.toLowerCase() !== currentDeployment.resolverImplementation)
      throw Error("Unsupported shared resolver");
  }
  const canPublish = await client.readContract({
    address: registry,
    abi: accessAbi,
    functionName: "hasRootRoles",
    args: [1n, wallet],
    blockNumber: block.number,
  });
  let catalog: import("@ens402/server/discovery").Catalog | undefined;
  let indexError: string | undefined;
  let awaitingFirstIndex = false;
  try {
    catalog = await configuredDiscovery().source.load();
  } catch (error) {
    awaitingFirstIndex = error instanceof DiscoveryNotReadyError;
    indexError = awaitingFirstIndex
      ? "The first search sync has not completed. Your service remains registered on ENS."
      : "Search is temporarily unavailable. Your service remains registered on ENS.";
  }
  const names = new Set(
    (catalog?.services ?? [])
      .map((row) => row.service.name)
      .filter(
        (name) =>
          name.endsWith(`.${provider}`) &&
          name.slice(0, -(provider.length + 1)).indexOf(".") === -1,
      ),
  );
  if (pendingInput) {
    const pending = normalize(pendingInput);
    if (
      !pending.endsWith(`.${provider}`) ||
      pending.slice(0, -(provider.length + 1)).includes(".")
    )
      throw Error("Pending service must be directly below this provider");
    names.add(pending);
  }
  if (names.size > 50)
    throw Error(
      "Provider has more than 50 services; narrow the catalog before loading this dashboard",
    );
  const services = await Promise.all(
    [...names].map(async (name) => {
      const label = name.split(".")[0]!;
      const serviceOwner = await client.readContract({
        address: registry,
        abi: currentRegistryAbi,
        functionName: "findOwner",
        args: [label],
        blockNumber: block.number,
      });
      const expiry = await client.readContract({
        address: registry,
        abi: accessAbi,
        functionName: "findExpiry",
        args: [label],
        blockNumber: block.number,
      });
      if (serviceOwner === zeroAddress || expiry <= block.timestamp)
        return { name, state: "expired", owner: serviceOwner, permissions: [] };
      try {
        const service = await resolveCurrentService(
          client,
          name,
          undefined,
          sharedResolver
            ? {
                mode: "provider-shared",
                providerName: provider,
                providerRegistry: registry,
                resolver: sharedResolver,
              }
            : { mode: "dedicated" },
        );
        const permissionBlock = BigInt(service.block);
        if (service.parentRegistry.toLowerCase() !== registry.toLowerCase())
          throw Error("Service registry membership changed");
        const permissions = await Promise.all(
          keys.map(async (key) => ({
            key,
            canWrite: await client.readContract({
              address: service.resolver,
              abi: accessAbi,
              functionName: "hasRoles",
              args: [BigInt(keccak256(stringToHex(key))), 16n, wallet],
              blockNumber: permissionBlock,
            }),
          })),
        );
        const broadText = await client.readContract({
          address: service.resolver,
          abi: accessAbi,
          functionName: "hasRootRoles",
          args: [16n, wallet],
          blockNumber: permissionBlock,
        });
        const textAdmin = await client.readContract({
          address: service.resolver,
          abi: accessAbi,
          functionName: "hasRootRoles",
          args: [16n << 128n, wallet],
          blockNumber: permissionBlock,
        });
        const indexed = catalog?.services.find(
          (row) => row.service.name === name,
        )?.service;
        const fresh =
          indexed &&
          BigInt(indexed.indexedBlock ?? "0") > 0n &&
          indexed.indexedAt >= Number(block.timestamp) - 3600 &&
          indexed.expiresAt > Number(block.timestamp) &&
          indexed.status === service.status &&
          indexed.endpoint === service.endpoint &&
          indexed.description === service.description &&
          indexed.payTo.toLowerCase() === service.payment.payTo.toLowerCase() &&
          service.payment.version !== 1 &&
          indexed.pricePerRequestAtomic === service.payment.pricing.amount &&
          isDeepStrictEqual(indexed.call, service.call);
        return {
          name,
          state:
            service.status === "suspended"
              ? "suspended"
              : awaitingFirstIndex
                ? "awaiting-index"
                : indexError
                ? "index-error"
                : fresh
                  ? "listed"
                  : "awaiting-index",
          owner: service.owner,
          service,
          resolverMode: sharedResolver
            ? "provider-shared"
            : (process.env.SERVICE_ENS_NAME || "")
                  .split(",")
                  .map((value) => value.trim())
                  .includes(name)
              ? "dedicated"
              : "unknown",
          permissionsBlock: service.block,
          permissions,
          broadText,
          textAdmin,
          controlled:
            service.owner.toLowerCase() === wallet.toLowerCase() ||
            permissions.some((permission) => permission.canWrite),
          indexedAt: indexed?.indexedAt,
        };
      } catch {
        return {
          name,
          state: "verification-error",
          owner: serviceOwner,
          permissions: [],
          error:
            "Current service records could not be verified. Do not infer control from the catalog.",
        };
      }
    }),
  );
  return {
    provider,
    registry,
    nameRegistry,
    sharedResolver,
    providerOwner: owner,
    wallet,
    canPublish,
    observedBlock: String(block.number),
    observedAt: Number(block.timestamp),
    indexError,
    services,
  };
}
