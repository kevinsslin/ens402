import { parseAbi } from "viem";
// These signatures describe the pinned deployment, not a future documentation API.
export const universalAbi = parseAbi([
  "function findResolver(bytes name) view returns (address resolver,bytes32 node,uint256 offset)",
  "function findOwner(bytes name) view returns (address)",
  "function findParentRegistry(bytes name) view returns (address)",
  "function resolve(bytes name,bytes data) view returns (bytes,address)",
]);
export const factoryAbi = parseAbi([
  "function verifyContract(address proxy) view returns (address implementation)",
  "function deployProxy(address implementation,uint256 salt,bytes data) returns (address proxy)",
]);
export const resolverAbi = parseAbi([
  "function text(bytes32 node,string key) view returns (string)",
  "function setText(bytes32 node,string key,string value)",
  "function getAlias(bytes name) view returns (bytes)",
  "function recordVersions(bytes32 node) view returns (uint64)",
  "function authorizeTextRoles(bytes name,string key,address account,bool grant) returns (bool)",
  "function hasRootRoles(uint256 roleBitmap,address account) view returns (bool)",
  "function roles(uint256 resource,address account) view returns (uint256)",
  "function initialize(address rootAccount,uint256 roleBitmap,bytes[] data)",
]);
export const registryAbi = parseAbi([
  "function findOwner(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function getSubregistry(string label) view returns (address)",
  "function setResolver(uint256 anyId,address resolver)",
  "function register(string label,address owner,address registry,address resolver,uint256 roleBitmap,uint64 expiry) returns (uint256)",
]);
export const recordKeys = [
  "agent-endpoint[x402]",
  "ens402.payment",
  "ens402.status",
  "description",
  "avatar",
] as const;
export type RecordKey = (typeof recordKeys)[number];
