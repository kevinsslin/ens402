import { createPublicClient, getAddress, http, isAddress, parseAbi } from 'viem';
import { sepolia } from 'viem/chains';
import { normalize } from 'viem/ens';
import {
  BASE_SEPOLIA_COIN_TYPE,
  ENDPOINT_RECORD_KEY,
  ENS_V2_FACTORY,
  ENS_V2_PERMISSIONED_RESOLVER_IMPL,
  ENS_V2_UNIVERSAL_RESOLVER,
} from './constants.js';

const factoryAbi = parseAbi(['function verifyContract(address proxy) view returns (address implementation)']);

type EnsClient = ReturnType<typeof createPublicClient>;

export interface ServiceAuthority {
  name: string;
  endpoint: string;
  payTo: `0x${string}`;
  resolver: `0x${string}`;
  implementation: `0x${string}`;
}

export function createEnsClient(rpcUrl: string): EnsClient {
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
}

export function canonicalResourceUrl(input: string): string {
  const url = new URL(input);
  if (url.protocol !== 'https:') throw new Error('Service endpoint must use HTTPS');
  if (url.username || url.password || url.hash) throw new Error('Service endpoint contains unsupported URL fields');
  if (url.port === '443') url.port = '';
  return url.href;
}

export async function resolveServiceAuthority(client: EnsClient, rawName: string): Promise<ServiceAuthority> {
  const name = normalize(rawName);
  if (await client.getChainId() !== sepolia.id) throw new Error('ENS RPC is not on Sepolia');
  const [endpoint, payTo, resolver] = await Promise.all([
    client.getEnsText({ name, key: ENDPOINT_RECORD_KEY, universalResolverAddress: ENS_V2_UNIVERSAL_RESOLVER }),
    client.getEnsAddress({ name, coinType: BASE_SEPOLIA_COIN_TYPE, universalResolverAddress: ENS_V2_UNIVERSAL_RESOLVER }),
    client.getEnsResolver({ name, universalResolverAddress: ENS_V2_UNIVERSAL_RESOLVER }),
  ]);
  if (!endpoint || !payTo || !resolver || !isAddress(payTo)) throw new Error('ENS service authority is incomplete');
  const implementation = await client.readContract({
    address: ENS_V2_FACTORY,
    abi: factoryAbi,
    functionName: 'verifyContract',
    args: [resolver],
  });
  if (getAddress(implementation) !== getAddress(ENS_V2_PERMISSIONED_RESOLVER_IMPL)) {
    throw new Error('ENS resolver implementation is not approved');
  }
  return {
    name,
    endpoint: canonicalResourceUrl(endpoint),
    payTo: getAddress(payTo),
    resolver: getAddress(resolver),
    implementation: getAddress(implementation),
  };
}
