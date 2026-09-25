import { createPublicClient, getAddress, http } from 'viem';
import { sepolia } from 'viem/chains';
import {
  ENS_V2_FACTORY, ENS_V2_PERMISSIONED_RESOLVER_IMPL, ENS_V2_UNIVERSAL_RESOLVER,
} from '@hufu402/sdk';

const deploymentBase = 'https://raw.githubusercontent.com/ensdomains/contracts-v2/main/contracts/deployments/sepolia';
const rpc = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const label = process.env.ENS_LABEL ?? 'hufu402';
const client = createPublicClient({ chain: sepolia, transport: http(rpc, { timeout: 10000 }) });

interface Deployment {
  address: `0x${string}`;
  abi: Array<{ type: string; name?: string; inputs?: Array<{ type: string }> }>;
}

async function deployment(name: string): Promise<Deployment> {
  const response = await fetch(`${deploymentBase}/${name}.json`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`ENS ${name} deployment fetch failed with HTTP ${response.status}`);
  return response.json() as Promise<Deployment>;
}

const names = ['ETHRegistrar', 'ETHRegistry', 'VerifiableFactory', 'PermissionedResolverImpl', 'UserRegistryImpl', 'UniversalResolverV2', 'UpgradableUniversalResolverProxy'];
const files = await Promise.all(names.map(deployment));
const deployments = Object.fromEntries(names.map((name, index) => [name, files[index]!])) as Record<string, Deployment>;
const pinned = {
  VerifiableFactory: ENS_V2_FACTORY,
  PermissionedResolverImpl: ENS_V2_PERMISSIONED_RESOLVER_IMPL,
  UpgradableUniversalResolverProxy: ENS_V2_UNIVERSAL_RESOLVER,
};
for (const [name, address] of Object.entries(pinned)) {
  if (getAddress(deployments[name]!.address) !== getAddress(address as `0x${string}`)) {
    throw new Error(`${name} live deployment differs from the SDK pin`);
  }
}
const codes = await Promise.all(names.map(name => client.getBytecode({ address: deployments[name]!.address })));
for (const [index, code] of codes.entries()) {
  if (!code || code === '0x') throw new Error(`${names[index]} has no Sepolia code`);
}
function signature(name: string, functionName: string): string[] {
  return deployments[name]!.abi.filter(item => item.type === 'function' && item.name === functionName)
    .map(item => `${functionName}(${(item.inputs ?? []).map(input => input.type).join(',')})`);
}
const expected = [
  ['PermissionedResolverImpl', 'initialize', 'initialize(address,uint256,bytes[])'],
  ['UserRegistryImpl', 'initialize', 'initialize(address,uint256)'],
  ['PermissionedResolverImpl', 'authorizeTextRoles', 'authorizeTextRoles(bytes,string,address,bool)'],
  ['PermissionedResolverImpl', 'authorizeAddrRoles', 'authorizeAddrRoles(bytes,uint256,address,bool)'],
  ['PermissionedResolverImpl', 'setAddr', 'setAddr(bytes32,uint256,bytes)'],
  ['PermissionedResolverImpl', 'setText', 'setText(bytes32,string,string)'],
] as const;
for (const [contract, name, value] of expected) {
  if (!signature(contract, name).includes(value)) throw new Error(`${contract} no longer exposes ${value}`);
}
const registrar = deployments.ETHRegistrar!;
const available = await client.readContract({
  address: registrar.address,
  abi: [{ type: 'function', name: 'isAvailable', stateMutability: 'view', inputs: [{ name: 'label', type: 'string' }], outputs: [{ name: '', type: 'bool' }] }],
  functionName: 'isAvailable', args: [label],
});
process.stdout.write(JSON.stringify({
  chainId: await client.getChainId(), label, available,
  deployments: Object.fromEntries(names.map(name => [name, deployments[name]!.address])),
  verifiedSignatures: expected.map(([, , value]) => value),
}, null, 2) + '\n');
import '../load-env';
