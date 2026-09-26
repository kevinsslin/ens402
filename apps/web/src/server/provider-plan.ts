import {
  encodeFunctionData,
  keccak256,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { normalize } from "viem/ens";
import { ensClient } from "@ens402/server";
import {
  currentDeployment as deployment,
  currentRegistryAbi,
} from "../../../../packages/sdk/src/ens/current";
import { factoryAbi } from "@ens402/sdk/ens";
import {
  providerInitialization,
  providerLabel,
  providerRegistryAbi,
  providerRoles,
} from "../../../../scripts/ens/provider-config";
import { sharedResolverPlan } from "../../../../scripts/ens/provider-shared";
import {
  providerRegistrarPlan,
  matchesRuntime,
} from "../../../../scripts/ens/provider-registrar";
import artifact from "./provider-artifact.json";
import legacyArtifact from "./provider-artifact-legacy.json";
import separatedArtifact from "./provider-artifact-separated.json";
import { retireRegistrarPlan } from "../../../../scripts/ens/retire-registrar";
export type ProviderSetup = {
  parent: string;
  label: string;
  admin: string;
  platformSigner: string;
  ops: string;
  treasury: string;
  salt: string;
  resolverSalt?: string;
  expiry?: string;
  registry?: string;
  resolver?: string;
  registrar?: string;
  previousRegistrar?: string;
};
const address = (value: string) => {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || value.toLowerCase() === zeroAddress)
    throw Error("Use nonzero Ethereum addresses");
  return value as Address;
};
/** Purely unsigned public setup planning. Signing wallets and native contracts enforce all permissions. */
export async function planProvider(input: ProviderSetup) {
  const parent = normalize(input.parent);
  const configuredParent = normalize(
    process.env.ENS_PARENT_NAME || "ens402.eth",
  );
  if (parent !== configuredParent)
    throw Error("Use the configured platform parent");
  const label = providerLabel(input.label),
    name = `${label}.${parent}`;
  const admin = address(input.admin),
    signer = address(input.platformSigner),
    ops = address(input.ops),
    treasury = address(input.treasury);
  if (!/^\d{1,78}$/.test(input.salt) || BigInt(input.salt) >= 2n ** 256n)
    throw Error("Invalid deployment salt");
  const salt = BigInt(input.salt);
  // The native factory identifies proxies by sender and salt, not implementation.
  // Domain-separate resolver creation from the registry deployment and persist it.
  const resolverSalt =
    input.resolverSalt ??
    BigInt(
      keccak256(
        stringToHex(
          `ens402:provider-resolver:${name}:${admin.toLowerCase()}:${salt}`,
        ),
      ),
    ).toString();
  if (
    !/^\d{1,78}$/.test(resolverSalt) ||
    BigInt(resolverSalt) >= 2n ** 256n ||
    BigInt(resolverSalt) === salt
  )
    throw Error(
      "Resolver deployment salt must be distinct from the registry salt",
    );
  const client = ensClient();
  const block = await client.getBlock();
  let platform: Address = deployment.rootRegistry;
  let ancestorExpiry = (1n << 64n) - 1n;
  for (const part of parent.split(".").reverse()) {
    const expires = await client.readContract({
      address: platform,
      abi: providerRegistryAbi,
      functionName: "findExpiry",
      args: [part],
      blockNumber: block.number,
    });
    if (expires < ancestorExpiry) ancestorExpiry = expires;
    platform = await client.readContract({
      address: platform,
      abi: currentRegistryAbi,
      functionName: "getSubregistry",
      args: [part],
      blockNumber: block.number,
    });
    if (platform === zeroAddress)
      throw Error("Platform namespace must be initialized by its owner first");
  }
  const expiry = input.expiry
    ? BigInt(input.expiry)
    : ancestorExpiry < block.timestamp + 2592000n
      ? ancestorExpiry
      : block.timestamp + 2592000n;
  if (
    expiry <= block.timestamp + 86400n ||
    expiry > ancestorExpiry ||
    expiry > block.timestamp + 31536000n
  )
    throw Error(
      "Expiry must fit the parent and remain valid for at least one day",
    );
  let registry = input.registry ? address(input.registry) : undefined;
  const txs: Array<{
    signer: Address;
    to?: Address;
    data: string;
    value: string;
    description: string;
  }> = [];
  const owner = await client.readContract({
    address: platform,
    abi: currentRegistryAbi,
    functionName: "findOwner",
    args: [label],
    blockNumber: block.number,
  });
  if (owner !== zeroAddress && owner.toLowerCase() !== admin.toLowerCase())
    throw Error("Provider belongs to another wallet");
  if (owner !== zeroAddress) {
    const linked = await client.readContract({
      address: platform,
      abi: currentRegistryAbi,
      functionName: "getSubregistry",
      args: [label],
      blockNumber: block.number,
    });
    if (
      linked === zeroAddress ||
      (registry && linked.toLowerCase() !== registry.toLowerCase())
    )
      throw Error("Existing provider registry differs; refusing replacement");
    registry = linked;
  }
  const code =
    registry &&
    (await client.getCode({ address: registry, blockNumber: block.number }));
  if (!code || code === "0x") {
    const args = [
      deployment.registryImplementation,
      salt,
      providerInitialization(admin),
    ] as const;
    const { result } = await client.simulateContract({
      account: admin,
      address: deployment.factory,
      abi: factoryAbi,
      functionName: "deployProxy",
      args,
    });
    if (registry && registry.toLowerCase() !== result.toLowerCase())
      throw Error("Registry prediction changed");
    registry = result;
    txs.push({
      signer: admin,
      to: deployment.factory,
      value: "0x0",
      data: encodeFunctionData({
        abi: factoryAbi,
        functionName: "deployProxy",
        args,
      }),
      description: "Create provider registry",
    });
  } else {
    const impl = await client.readContract({
      address: deployment.factory,
      abi: factoryAbi,
      functionName: "verifyContract",
      args: [registry!],
      blockNumber: block.number,
    });
    if (impl.toLowerCase() !== deployment.registryImplementation)
      throw Error("Unsupported provider registry");
    if (
      !(await client.readContract({
        address: registry!,
        abi: providerRegistryAbi,
        functionName: "hasRootRoles",
        args: [providerRoles.registrar | providerRoles.registrarAdmin, admin],
        blockNumber: block.number,
      }))
    )
      throw Error("Provider admin lacks native registration governance");
  }
  if (owner === zeroAddress) {
    if (
      !(await client.readContract({
        address: platform,
        abi: providerRegistryAbi,
        functionName: "hasRootRoles",
        args: [1n, signer],
        blockNumber: block.number,
      }))
    )
      throw Error(
        "Platform signer needs native ROLE_REGISTRAR before onboarding",
      );
    txs.push({
      signer,
      to: platform,
      value: "0x0",
      data: encodeFunctionData({
        abi: providerRegistryAbi,
        functionName: "register",
        args: [
          label,
          admin,
          registry!,
          zeroAddress,
          providerRoles.name,
          expiry,
        ],
      }),
      description: "Register provider name and attach its registry",
    });
  }
  let phase = 0;
  let registrationMode: "direct" | "commit-reveal" = "direct";
  let resolver = input.resolver ? address(input.resolver) : undefined;
  if (!txs.length) {
    phase = 1;
    const shared = await sharedResolverPlan(
      client,
      admin,
      ops,
      treasury,
      name,
      BigInt(resolverSalt),
      block.number,
      resolver,
    );
    resolver = shared.resolver;
    txs.push(...shared.transactions);
    if (!txs.length) {
      phase = 2;
      const existingCode = input.registrar
        ? await client.getCode({
            address: address(input.registrar),
            blockNumber: block.number,
          })
        : undefined;
      const legacy =
        existingCode &&
        matchesRuntime(
          existingCode,
          legacyArtifact.deployedBytecode.object as Hex,
          legacyArtifact.deployedBytecode.immutableReferences,
        );
      const separated = existingCode && matchesRuntime(existingCode, separatedArtifact.deployedBytecode.object as Hex, separatedArtifact.deployedBytecode.immutableReferences);
      registrationMode = legacy ? "commit-reveal" : "direct";
      const registrar = await providerRegistrarPlan(
        client,
        admin,
        registry!,
        name,
        expiry,
        block.number,
        input.registrar ? address(input.registrar) : undefined,
        resolver,
        ops,
        treasury,
        (legacy ? legacyArtifact : separated ? separatedArtifact : artifact) as unknown as Parameters<
          typeof providerRegistrarPlan
        >[10],
      );
      txs.push(...registrar.transactions);
      if (input.previousRegistrar && input.registrar) {
        if (
          registrationMode !== "direct" ||
          input.previousRegistrar.toLowerCase() ===
            input.registrar.toLowerCase()
        )
          throw Error(
            "Replacement registrar must be distinct and support direct registration",
          );
        await providerRegistrarPlan(
          client,
          admin,
          registry!,
          name,
          expiry,
          block.number,
          address(input.previousRegistrar),
          resolver,
          ops,
          treasury,
          legacyArtifact as unknown as Parameters<
            typeof providerRegistrarPlan
          >[10],
        );
        txs.push(
          ...(await retireRegistrarPlan(
            client,
            admin,
            registry!,
            resolver!,
            address(input.previousRegistrar),
            block.number,
          )),
        );
      }
    }
  }
  return {
    setup: {
      ...input,
      parent,
      label,
      registry,
      resolver,
      resolverSalt,
      expiry: String(expiry),
    },
    name,
    registrationMode,
    observedBlock: String(block.number),
    ready: !txs.length,
    phase: txs.length ? phase : 3,
    hasConfirmedSetup: Boolean(code && code !== "0x"),
    transactions: txs,
  };
}
