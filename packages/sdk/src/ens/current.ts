import {
  bytesToHex,
  decodeFunctionResult,
  encodeFunctionData,
  keccak256,
  stringToHex,
  zeroAddress,
  parseAbi,
  type PublicClient,
  type Address,
  type Hex,
} from "viem";
import { namehash, normalize, packetToBytes } from "viem/ens";
import { sameAddress } from "../index";
import {
  parsePaymentRecord,
  validateDescription,
  validatePicture,
  validateEndpoint,
  type ResolvedService,
} from "./index";
import { factoryAbi, recordKeys, universalAbi, resolverAbi } from "./abi";
export const currentDeployment = {
  chainId: 11155111,
  sourceCommit: "71a3b7339dbc55ab47667abdfe8303bac4f4c24e",
  universalResolver: "0x5d25c1d6acbb71b7a28aa7899618a3412a8303e3",
  universalResolverCodeHash:
    "0x77851ce255e0932b1b6f8f88395db21f2e443cbd14c75c3ca4387ab3ce46a9c5",
  factory: "0x9e726eb570beb6bceb495ab8cda7df517d4e841c",
  factoryCodeHash:
    "0x7ccfd46da461cb7145497a383f2a6e6582be057b8bef3de694530b699632ecda",
  resolverImplementation: "0x14f09fd05d4585759e54844dc9b00147131cf243",
  resolverImplementationCodeHash:
    "0x00de223fd76d537e07b24abe5537e3c852e934dbe4db22c02f94a143e4ceeea3",
  registryImplementation: "0xa80338aaa8d23831cea25e858d1774534abb0263",
  rootRegistry: "0x9703dbd26dab89504490994138cf2c575251a9ce",
  ethRegistrar: "0xabe76f6c8dfced81aa5a2bb8034202a7136b94ca",
} as const;
export const currentResolverAbi = parseAbi([
  "function initialize((address account,uint256 roleBitmap)[] grants,bytes[] calls)",
  "function setText(bytes name,string key,string value)",
  "function grantSetterRoles(bytes setter,address account) returns (bool)",
  "function revokeRoles(uint256 resource,uint256 roleBitmap,address account) returns (bool)",
  "function getRecordId(bytes32 node) view returns (uint256)",
  "function getRecordCount() view returns (uint256)",
  "function hasRootRoles(uint256 roleBitmap,address account) view returns (bool)",
]);
export const currentRegistryAbi = parseAbi([
  "function initialize((address account,uint256 roleBitmap)[] grants)",
  "function findOwner(string label) view returns (address)",
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
]);
/** Current official deployment: native registry traversal and one resolver per service. */
export async function resolveCurrentService(
  client: PublicClient,
  input: string,
  now = Math.floor(Date.now() / 1000),
): Promise<ResolvedService> {
  if ((await client.getChainId()) !== 11155111)
    throw new Error("ENS requires Sepolia");
  const name = normalize(input),
    labels = name.split(".");
  if (labels.length < 2 || name.length > 255)
    throw new Error("Use a complete service name");
  const block = await client.getBlock({ blockTag: "latest" });
  if (
    !block.hash ||
    block.number === null ||
    Number(block.timestamp) > now + 30 ||
    now - Number(block.timestamp) > 180
  )
    throw new Error("ENS RPC head is stale");
  const blockNumber = block.number,
    d = currentDeployment;
  for (const [address, hash] of [
    [d.universalResolver, d.universalResolverCodeHash],
    [d.factory, d.factoryCodeHash],
    [d.resolverImplementation, d.resolverImplementationCodeHash],
  ] as const) {
    const code = await client.getCode({ address, blockNumber });
    if (!code || keccak256(code) !== hash)
      throw new Error("ENS deployment changed");
  }
  let parentRegistry: Address = d.rootRegistry,
    owner: Address = zeroAddress;
  const lineage: string[] = [];
  for (let i = labels.length - 1; i >= 0; i--) {
    owner = await client.readContract({
      address: parentRegistry,
      abi: currentRegistryAbi,
      functionName: "findOwner",
      args: [labels[i]!],
      blockNumber,
    });
    if (sameAddress(owner, zeroAddress))
      throw new Error("Name or ancestor is not registered");
    lineage.push(`${parentRegistry.toLowerCase()}:${owner.toLowerCase()}`);
    if (i > 0) {
      parentRegistry = await client.readContract({
        address: parentRegistry,
        abi: currentRegistryAbi,
        functionName: "getSubregistry",
        args: [labels[i]!],
        blockNumber,
      });
      if (sameAddress(parentRegistry, zeroAddress))
        throw new Error("Missing native subregistry");
    }
  }
  const dns = bytesToHex(packetToBytes(name)),
    node = namehash(name);
  const [resolver, resolvedNode, offset] = await client.readContract({
    address: d.universalResolver,
    abi: universalAbi,
    functionName: "findResolver",
    args: [dns],
    blockNumber,
  });
  if (
    sameAddress(resolver, zeroAddress) ||
    offset !== 0n ||
    resolvedNode !== node
  )
    throw new Error("Exact native resolver required");
  const implementation = await client.readContract({
    address: d.factory,
    abi: factoryAbi,
    functionName: "verifyContract",
    args: [resolver],
    blockNumber,
  });
  if (!sameAddress(implementation, d.resolverImplementation))
    throw new Error("Unsupported native resolver");
  const [recordId, count] = await Promise.all([
    client.readContract({
      address: resolver,
      abi: currentResolverAbi,
      functionName: "getRecordId",
      args: [node],
      blockNumber,
    }),
    client.readContract({
      address: resolver,
      abi: currentResolverAbi,
      functionName: "getRecordCount",
      blockNumber,
    }),
  ]);
  // Current native key permissions span records. Sharing a resolver would cross service boundaries.
  if (recordId !== 1n || count !== 1n)
    throw new Error("Use a dedicated one-record resolver for this service");
  const records = await Promise.all(
    recordKeys.map(async (key) => {
      const [result, actual] = await client.readContract({
        address: d.universalResolver,
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
      if (!sameAddress(actual, resolver)) throw new Error("Resolver changed");
      return decodeFunctionResult({
        abi: resolverAbi,
        functionName: "text",
        data: result,
      });
    }),
  );
  if (!["active", "suspended"].includes(records[2]!))
    throw new Error("Unsupported service status");
  const authority = keccak256(
    stringToHex(
      [
        d.chainId,
        name,
        ...lineage,
        resolver.toLowerCase(),
        implementation.toLowerCase(),
        String(recordId),
      ].join(":"),
    ),
  );
  return {
    deployment: "current",
    name,
    endpoint: validateEndpoint(records[0]!),
    payment: parsePaymentRecord(records[1]!),
    description: validateDescription(records[3]!),
    picture: validatePicture(records[4]!),
    status: records[2]!,
    authority,
    block: String(block.number),
    blockHash: block.hash,
    observedAt: now,
    resolver,
    implementation,
    owner,
    parentRegistry,
    recordVersion: String(recordId),
    authorityCoverage: [
      "native ancestor ownership and registry pointers",
      "exact owner",
      "factory-verified resolver",
      "dedicated record",
      "root administrators remain trusted",
    ],
  };
}
