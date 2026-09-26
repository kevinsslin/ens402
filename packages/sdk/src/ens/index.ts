import { parseCallMetadata } from "../call";
import { resolveCurrentService, currentResolverAbi, type CurrentResolverPolicy } from "./current";
export type { CurrentResolverPolicy } from "./current";
export {
  currentDeployment,
  currentResolverAbi,
  currentRegistryAbi,
} from "./current";
import {
  bytesToHex,
  decodeFunctionResult,
  encodeFunctionData,
  keccak256,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { namehash, normalize, packetToBytes } from "viem/ens";
import {
  NETWORK,
  USDC,
  sameAddress,
  validAmount,
  type PaymentConfig,
  type ServiceSnapshot,
} from "../index";
import { ensDeployment } from "./deployment";
import {
  factoryAbi,
  recordKeys,
  resolverAbi,
  universalAbi,
  type RecordKey,
} from "./abi";
export { ensDeployment, factoryAbi, recordKeys, resolverAbi, universalAbi };
export type ResolvedService = ServiceSnapshot & {
  deployment?: "legacy" | "current";
  resolver: Address;
  implementation: Address;
  owner: Address;
  parentRegistry: Address;
  blockHash: Hex;
  recordVersion: string;
  authorityCoverage: readonly string[];
};
export function parsePaymentRecord(raw: string): PaymentConfig {
  if (raw.length > 4096) throw new Error("Payment record is too large");
  const p = JSON.parse(raw) as PaymentConfig;
  if (
    !p ||
    ![1, 2].includes(p.version) ||
    p.scheme !== "exact" ||
    p.network !== NETWORK ||
    !sameAddress(p.asset, USDC) ||
    !sameAddress(p.payTo, p.payTo) ||
    sameAddress(p.payTo, zeroAddress)
  )
    throw new Error("Unsupported ENS payment record");
  const base = {
    scheme: "exact" as const,
    network: NETWORK,
    asset: p.asset.toLowerCase(),
    payTo: p.payTo.toLowerCase(),
  };
  if (p.version === 2) {
    if (
      p.pricing?.model !== "fixed" ||
      p.pricing.unit !== "request" ||
      typeof p.pricing.amount !== "string" ||
      !validAmount(p.pricing.amount) ||
      BigInt(p.pricing.amount) <= 0n
    )
      throw new Error("A positive fixed price in atomic units is required");
    return {
      ...base,
      version: 2,
      pricing: { model: "fixed", amount: p.pricing.amount, unit: "request" },
    };
  }
  if ("pricing" in p)
    throw new Error("Pricing requires payment schema version 2");
  return { ...base, version: 1 };
}
export function validateDescription(raw: string): string {
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).length > 1024 ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(raw)
  )
    throw new Error("Description must be at most 1024 bytes");
  return raw.trim();
}
export function validatePicture(raw: string): string {
  if (!raw) return "";
  return validateEndpoint(raw);
}
export function validateEndpoint(raw: string): string {
  if (new TextEncoder().encode(raw).length > 2048)
    throw new Error("URL must be at most 2048 UTF-8 bytes");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error(
      "Endpoint must be an HTTPS URL without credentials or fragment",
    );
  if (new TextEncoder().encode(url.href).length > 2048)
    throw new Error("Encoded URL must be at most 2048 UTF-8 bytes");
  return url.href;
}
/** No arbitrary CCIP gateways. Supports on-chain records on the pinned native resolver. */
export async function resolveService(
  client: PublicClient,
  input: string,
  now = Math.floor(Date.now() / 1000),
  deployment: "legacy" | "current" = "current",
  resolverPolicy: CurrentResolverPolicy = { mode: "dedicated" },
): Promise<ResolvedService> {
  if (deployment === "current")
    return resolveCurrentService(client, input, now, resolverPolicy);
  if (resolverPolicy.mode !== "dedicated") throw new Error("Shared resolver policy requires the current ENS deployment");
  if ((await client.getChainId()) !== ensDeployment.chainId)
    throw new Error("ENS requires Sepolia");
  const name = normalize(input);
  if (name.split(".").length < 2)
    throw new Error("Use a complete service name");
  const dns = bytesToHex(packetToBytes(name));
  const node = namehash(name);
  const block = await client.getBlock({ blockTag: "latest" });
  if (
    !block.hash ||
    block.number === null ||
    Number(block.timestamp) > now + 30 ||
    now - Number(block.timestamp) > 180
  )
    throw new Error("ENS RPC head is stale");
  const blockNumber = block.number;
  const pins = [
    [ensDeployment.universalResolver, ensDeployment.universalResolverCodeHash],
    [ensDeployment.factory, ensDeployment.factoryCodeHash],
    [
      ensDeployment.resolverImplementation,
      ensDeployment.resolverImplementationCodeHash,
    ],
  ] as const;
  await Promise.all(
    pins.map(async ([address, hash]) => {
      const code = await client.getCode({ address, blockNumber });
      if (!code || keccak256(code) !== hash)
        throw new Error("ENS deployment code does not match supported version");
    }),
  );
  const query = {
    address: ensDeployment.universalResolver,
    abi: universalAbi,
    args: [dns],
    blockNumber,
  } as const;
  const [found, owner, parentRegistry] = await Promise.all([
    client.readContract({ ...query, functionName: "findResolver" }),
    client.readContract({ ...query, functionName: "findOwner" }),
    client.readContract({ ...query, functionName: "findParentRegistry" }),
  ]);
  const [resolver, resolvedNode, offset] = found;
  if (
    sameAddress(resolver, zeroAddress) ||
    sameAddress(owner, zeroAddress) ||
    sameAddress(parentRegistry, zeroAddress) ||
    offset !== 0n ||
    resolvedNode !== node
  )
    throw new Error(
      "Service must be registered with an exact resolver and owner",
    );
  const implementation = await client.readContract({
    address: ensDeployment.factory,
    abi: factoryAbi,
    functionName: "verifyContract",
    args: [resolver],
    blockNumber,
  });
  if (!sameAddress(implementation, ensDeployment.resolverImplementation))
    throw new Error("Unsupported native resolver implementation");
  const alias = await client.readContract({
    address: resolver,
    abi: resolverAbi,
    functionName: "getAlias",
    args: [dns],
    blockNumber,
  });
  if (alias !== "0x")
    throw new Error("Aliased services require an explicit integration");
  const records = await Promise.all(
    recordKeys.map(async (key) => {
      const [result, actualResolver] = await client.readContract({
        address: ensDeployment.universalResolver,
        abi: universalAbi,
        functionName: "resolve",
        args: [
          dns,
          encodeFunctionData({
            abi: resolverAbi,
            functionName: "text",
            args: [node, key],
          }),
        ],
        blockNumber,
      });
      if (!sameAddress(actualResolver, resolver))
        throw new Error("Resolver changed within the observation");
      return decodeFunctionResult({
        abi: resolverAbi,
        functionName: "text",
        data: result,
      });
    }),
  );
  const recordVersion = await client.readContract({
    address: resolver,
    abi: resolverAbi,
    functionName: "recordVersions",
    args: [node],
    blockNumber,
  });
  const payment = parsePaymentRecord(records[1]!);
  const endpoint = validateEndpoint(records[0]!);
  if (!["active", "suspended"].includes(records[2]!))
    throw new Error("Unsupported service status");
  // This observes identity/pointers, not every EAC assignee or ancestor administrator.
  const authority = keccak256(
    stringToHex(
      [
        ensDeployment.chainId,
        name,
        resolver.toLowerCase(),
        implementation.toLowerCase(),
        owner.toLowerCase(),
        parentRegistry.toLowerCase(),
        recordVersion.toString(),
      ].join(":"),
    ),
  );
  return {
    name,
    endpoint,
    description: validateDescription(records[3]!),
    picture: validatePicture(records[4]!),
    call: records[5] ? parseCallMetadata(records[5]) : undefined,
    status: records[2]!,
    payment,
    authority,
    block: String(block.number),
    blockHash: block.hash,
    observedAt: now,
    resolver,
    implementation,
    owner,
    parentRegistry,
    recordVersion: String(recordVersion),
    authorityCoverage: [
      "exact owner",
      "parent registry",
      "resolver pointer",
      "factory-verified implementation",
      "record version",
      "aliases rejected",
    ],
  };
}
export type EnsTransaction = {
  chainId: 11155111;
  to: Address;
  data: Hex;
  value: "0x0";
  description: string;
};
export function prepareRecordUpdate(
  service: Pick<ResolvedService, "name" | "resolver" | "deployment">,
  key: RecordKey,
  value: string,
): EnsTransaction {
  if (!recordKeys.includes(key)) throw new Error("Unsupported service record");
  if (key === "agent-endpoint[x402]") value = validateEndpoint(value);
  if (key === "ens402.payment")
    value = JSON.stringify(parsePaymentRecord(value));
  if (key === "description") value = validateDescription(value);
  if (key === "avatar") value = validatePicture(value);
  if (key === "ens402.call") parseCallMetadata(value);
  if (key === "ens402.status" && !["active", "suspended"].includes(value))
    throw new Error("Unsupported status");
  return {
    chainId: 11155111,
    to: service.resolver,
    data:
      service.deployment === "current"
        ? encodeFunctionData({
            abi: currentResolverAbi,
            functionName: "setText",
            args: [bytesToHex(packetToBytes(service.name)), key, value],
          })
        : encodeFunctionData({
            abi: resolverAbi,
            functionName: "setText",
            args: [namehash(service.name), key, value],
          }),
    value: "0x0",
    description: `Update ${key} for ${service.name}`,
  };
}
export function prepareTextPermission(
  service: Pick<ResolvedService, "name" | "resolver" | "deployment">,
  key: RecordKey,
  operator: Address,
  grant: boolean,
): EnsTransaction {
  if (
    !recordKeys.includes(key) ||
    !sameAddress(operator, operator) ||
    sameAddress(operator, zeroAddress)
  )
    throw new Error("Invalid permission request");
  if (service.deployment === "current") {
    const setter = encodeFunctionData({
      abi: currentResolverAbi,
      functionName: "setText",
      args: [bytesToHex(packetToBytes(service.name)), key, ""],
    });
    return {
      chainId: 11155111,
      to: service.resolver,
      value: "0x0",
      data: grant
        ? encodeFunctionData({
            abi: currentResolverAbi,
            functionName: "grantSetterRoles",
            args: [setter, operator],
          })
        : encodeFunctionData({
            abi: currentResolverAbi,
            functionName: "revokeRoles",
            args: [BigInt(keccak256(stringToHex(key))), 16n, operator],
          }),
      description: `${grant ? "Grant" : "Revoke"} native ${key} writer. This key permission applies to this dedicated resolver; root rights are separate.`,
    };
  }
  return {
    chainId: 11155111,
    to: service.resolver,
    data: encodeFunctionData({
      abi: resolverAbi,
      functionName: "authorizeTextRoles",
      args: [bytesToHex(packetToBytes(service.name)), key, operator, grant],
    }),
    value: "0x0",
    description: `${grant ? "Grant" : "Revoke"} ${key} write permission for ${service.name}. Broader root or name permissions are separate.`,
  };
}
export async function simulateEnsTransaction(
  client: PublicClient,
  from: Address,
  transaction: EnsTransaction,
) {
  if (
    (await client.getChainId()) !== 11155111 ||
    transaction.chainId !== 11155111
  )
    throw new Error("ENS writes require Sepolia");
  await client.call({
    account: from,
    to: transaction.to,
    data: transaction.data,
    value: 0n,
  });
  const broadTextPermission = await client.readContract({
    address: transaction.to,
    abi: resolverAbi,
    functionName: "hasRootRoles",
    args: [16n, from],
  });
  return { simulation: "passed" as const, broadTextPermission };
}
