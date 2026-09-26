import { parseAbi } from 'viem';
/** ServiceRegistrar is application glue; native ENS contracts retain permission enforcement. */
export const serviceRegistrarAbi = parseAbi([
 'function makeCommitment((string label,string endpoint,address payTo,address endpointOperator,address treasury) service,address owner,bytes32 secret) view returns (bytes32)',
 'function commit(bytes32 commitment)',
 'function register((string label,string endpoint,address payTo,address endpointOperator,address treasury) service,bytes32 secret) returns (address resolverAddress,uint256 tokenId)',
 'function commitments(bytes32) view returns (uint256)',
 'function registrationExpiry() view returns (uint64)',
 'function currentResolver() view returns (bool)',
 'function parentDNS() view returns (bytes)',
]);
