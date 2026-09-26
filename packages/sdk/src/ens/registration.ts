import { parseAbi } from "viem";
/** ServiceRegistrar is application glue; native ENS contracts retain permission enforcement. */
export const serviceRegistrarAbi = parseAbi([
  "function registrationMode() view returns (uint8)",
  "function makeCommitment((string label,string endpoint,address payTo,address endpointOperator,address treasury,string description,string picture,uint256 price,string callConfig) service,address owner,bytes32 secret) view returns (bytes32)",
  "function commit(bytes32 commitment)",
  "function register((string label,string endpoint,address payTo,address endpointOperator,address treasury,string description,string picture,uint256 price,string callConfig) service,bytes32 secret) returns (address resolverAddress,uint256 tokenId)",
  "function commitments(bytes32) view returns (uint256)",
  "function registrationExpiry() view returns (uint64)",
  "function registry() view returns (address)",
  "function sharedResolver() view returns (address)",
  "function currentResolver() view returns (bool)",
  "function parentDNS() view returns (bytes)",
]);
