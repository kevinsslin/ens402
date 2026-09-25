import {
  createPublicClient, encodeAbiParameters, getAddress, http, isAddress,
  keccak256, namehash, parseAbi, parseAbiItem, stringToHex,
} from 'viem';
import { normalize } from 'viem/ens';
import { sepolia } from 'viem/chains';
import {
  BASE_SEPOLIA_COIN_TYPE, ENDPOINT_RECORD_KEY, ENS_V2_FACTORY,
  ENS_V2_PERMISSIONED_RESOLVER_IMPL, canonicalResourceUrl,
  resolveServiceAuthority,
} from '@hufu402/sdk';

const allRoles = BigInt('0x' + '1'.repeat(64));
const setText = 1n << 4n;
const setAddress = 1n;
const zeroHash = '0x' + '00'.repeat(32) as `0x${string}`;
const roleEvent = parseAbiItem('event EACRolesChanged(uint256 indexed resource,address indexed account,uint256 oldRoleBitmap,uint256 newRoleBitmap)');
const proxyEvent = parseAbiItem('event ProxyDeployed(address indexed sender,address indexed proxyAddress,uint256 salt,address implementation)');
const resolverAbi = parseAbi([
  'function roles(uint256 resource,address account) view returns (uint256)',
  'function hasRoles(uint256 resource,uint256 roleBitmap,address account) view returns (bool)',
  'function hasRootRoles(uint256 roleBitmap,address account) view returns (bool)',
]);
const factoryAbi = parseAbi(['function verifyContract(address proxy) view returns (address implementation)']);
const safeAbi = parseAbi([
  'function getThreshold() view returns (uint256)',
  'function getOwners() view returns (address[])',
]);
const registryAbi = parseAbi([
  'function getOwner(uint256 anyId) view returns (address)',
  'function getResolver(string label) view returns (address)',
  'function getSubregistry(string label) view returns (address)',
  'function getParent() view returns (address parent,string label)',
  'function roles(uint256 anyId,address account) view returns (uint256)',
  'function isApprovedForAll(address account,address operator) view returns (bool)',
]);

function requiredAddress(name: string): `0x${string}` {
  const value = process.env[name];
  if (!value || !isAddress(value)) throw new Error(`${name} must be a valid address`);
  return getAddress(value);
}
function requireEqual(actual: string, expected: string, label: string) {
  if (actual.toLowerCase() !== expected.toLowerCase()) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
function resource(node: `0x${string}`, part: `0x${string}`): bigint {
  if (node === zeroHash && part === zeroHash) return 0n;
  return BigInt(keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }], [node, part])));
}
function labelHash(label: string): bigint { return BigInt(keccak256(stringToHex(label))); }

const safe = requiredAddress('TREASURY_SAFE_ADDRESS');
const ops = requiredAddress('ENS_OPS_ADDRESS');
const payTo = requiredAddress('X402_PAY_TO');
if (safe === ops || ops === payTo) throw new Error('Ops must be separate from the Safe and payee');
const rawName = process.env.SERVICE_ENS_NAME;
const rawEndpoint = process.env.MERCHANT_RESOURCE_URL;
const rawDeployBlock = process.env.ENS_RESOLVER_DEPLOY_BLOCK;
if (!rawName || !rawEndpoint || !rawDeployBlock || !/^[0-9]+$/.test(rawDeployBlock)) {
  throw new Error('SERVICE_ENS_NAME, MERCHANT_RESOURCE_URL, and ENS_RESOLVER_DEPLOY_BLOCK are required');
}
const name = normalize(rawName);
const labels = name.split('.');
if (labels.length !== 3 || labels[2] !== 'eth') throw new Error('SERVICE_ENS_NAME must be a direct subname of a .eth name');
const [serviceLabel, parentLabel] = labels as [string, string, string];
const expectedEndpoint = canonicalResourceUrl(rawEndpoint);
const deployBlock = BigInt(rawDeployBlock);
const client = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com', { timeout: 20000 }),
});
const tip = await client.getBlockNumber();
if (deployBlock > tip) throw new Error('ENS_RESOLVER_DEPLOY_BLOCK is after the current Sepolia block');
const [safeThreshold, safeOwners] = await Promise.all([
  client.readContract({ address: safe, abi: safeAbi, functionName: 'getThreshold' }),
  client.readContract({ address: safe, abi: safeAbi, functionName: 'getOwners' }),
]);
if (safeThreshold !== 2n || safeOwners.length !== 3) throw new Error('Treasury Safe is not deployed as 2-of-3');

const authority = await resolveServiceAuthority(client, name);
requireEqual(authority.endpoint, expectedEndpoint, 'ENS endpoint');
requireEqual(authority.payTo, payTo, 'ENS Base Sepolia payee');
const deployment = await client.getLogs({
  address: ENS_V2_FACTORY, event: proxyEvent, args: { proxyAddress: authority.resolver },
  fromBlock: deployBlock, toBlock: deployBlock,
});
if (deployment.length !== 1 || getAddress(deployment[0]!.args.implementation!) !== getAddress(ENS_V2_PERMISSIONED_RESOLVER_IMPL)) {
  throw new Error('Resolver proxy was not deployed by the expected ENS factory at ENS_RESOLVER_DEPLOY_BLOCK');
}
const implementation = await client.readContract({ address: ENS_V2_FACTORY, abi: factoryAbi,
  functionName: 'verifyContract', args: [authority.resolver] });
requireEqual(implementation, ENS_V2_PERMISSIONED_RESOLVER_IMPL, 'Resolver implementation');

async function deploymentAddress(contract: string): Promise<`0x${string}`> {
  const response = await fetch(`https://raw.githubusercontent.com/ensdomains/contracts-v2/main/contracts/deployments/sepolia/${contract}.json`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Could not fetch current Sepolia ${contract} deployment`);
  const body = await response.json() as { address?: string };
  if (!body.address || !isAddress(body.address)) throw new Error(`Invalid Sepolia ${contract} deployment`);
  return getAddress(body.address);
}
const [parentRegistry, registryImplementation] = await Promise.all([
  deploymentAddress('ETHRegistry'), deploymentAddress('UserRegistryImpl'),
]);
const parentId = labelHash(parentLabel);
const serviceId = labelHash(serviceLabel);
const [parentOwner, parentResolver, subregistry, parentSafeRoles, parentOpsRoles, parentOpsRootRoles, parentOpsApproval] = await Promise.all([
  client.readContract({ address: parentRegistry, abi: registryAbi, functionName: 'getOwner', args: [parentId] }),
  client.readContract({ address: parentRegistry, abi: registryAbi, functionName: 'getResolver', args: [parentLabel] }),
  client.readContract({ address: parentRegistry, abi: registryAbi, functionName: 'getSubregistry', args: [parentLabel] }),
  client.readContract({ address: parentRegistry, abi: registryAbi, functionName: 'roles', args: [parentId, safe] }),
  client.readContract({ address: parentRegistry, abi: registryAbi, functionName: 'roles', args: [parentId, ops] }),
  client.readContract({ address: parentRegistry, abi: registryAbi, functionName: 'roles', args: [0n, ops] }),
  client.readContract({ address: parentRegistry, abi: registryAbi, functionName: 'isApprovedForAll', args: [safe, ops] }),
]);
requireEqual(parentOwner, safe, 'Parent ENS owner');
requireEqual(parentResolver, authority.resolver, 'Parent ENS resolver');
const requiredNameRoles = (1n << 20n) | (1n << 24n) | (1n << 148n) | (1n << 152n) | (1n << 156n);
if ((parentSafeRoles & requiredNameRoles) !== requiredNameRoles) {
  throw new Error('Treasury Safe lacks required parent registry administration roles');
}
if (parentOpsRoles !== 0n || parentOpsRootRoles !== 0n || parentOpsApproval) throw new Error('Ops has parent registry control');
const registryProxyImplementation = await client.readContract({ address: ENS_V2_FACTORY, abi: factoryAbi,
  functionName: 'verifyContract', args: [subregistry] });
requireEqual(registryProxyImplementation, registryImplementation, 'Subregistry implementation');
const [serviceOwner, serviceResolver, parentPointer, serviceRegistryRoles, serviceOpsRoles, serviceOpsRootRoles, serviceOpsApproval] = await Promise.all([
  client.readContract({ address: subregistry, abi: registryAbi, functionName: 'getOwner', args: [serviceId] }),
  client.readContract({ address: subregistry, abi: registryAbi, functionName: 'getResolver', args: [serviceLabel] }),
  client.readContract({ address: subregistry, abi: registryAbi, functionName: 'getParent' }),
  client.readContract({ address: subregistry, abi: registryAbi, functionName: 'roles', args: [serviceId, safe] }),
  client.readContract({ address: subregistry, abi: registryAbi, functionName: 'roles', args: [serviceId, ops] }),
  client.readContract({ address: subregistry, abi: registryAbi, functionName: 'roles', args: [0n, ops] }),
  client.readContract({ address: subregistry, abi: registryAbi, functionName: 'isApprovedForAll', args: [safe, ops] }),
]);
requireEqual(serviceOwner, safe, 'Service ENS owner');
requireEqual(serviceResolver, authority.resolver, 'Service ENS resolver');
requireEqual(parentPointer[0], parentRegistry, 'Subregistry parent');
if (parentPointer[1] !== parentLabel) throw new Error('Subregistry parent label mismatch');
if ((serviceRegistryRoles & requiredNameRoles) !== requiredNameRoles) {
  throw new Error('Treasury Safe lacks required service registry administration roles');
}
if (serviceOpsRoles !== 0n || serviceOpsRootRoles !== 0n || serviceOpsApproval) throw new Error('Ops has service registry control');

const node = namehash(name);
const endpointResource = resource(node, keccak256(stringToHex(ENDPOINT_RECORD_KEY)));
const payeeResource = resource(node, keccak256(encodeAbiParameters([{ type: 'uint256' }], [BASE_SEPOLIA_COIN_TYPE])));
const nameResource = resource(node, zeroHash);
const globalEndpointResource = resource(zeroHash, keccak256(stringToHex(ENDPOINT_RECORD_KEY)));
const [safeRootRoles, safeRootAccess, opsRootRoles, opsEndpointAccess, opsPayeeAccess, opsNameRoles, opsGlobalEndpointRoles] = await Promise.all([
  client.readContract({ address: authority.resolver, abi: resolverAbi, functionName: 'roles', args: [0n, safe] }),
  client.readContract({ address: authority.resolver, abi: resolverAbi, functionName: 'hasRootRoles', args: [setText | setAddress, safe] }),
  client.readContract({ address: authority.resolver, abi: resolverAbi, functionName: 'roles', args: [0n, ops] }),
  client.readContract({ address: authority.resolver, abi: resolverAbi, functionName: 'hasRoles', args: [endpointResource, setText, ops] }),
  client.readContract({ address: authority.resolver, abi: resolverAbi, functionName: 'hasRoles', args: [payeeResource, setAddress, ops] }),
  client.readContract({ address: authority.resolver, abi: resolverAbi, functionName: 'roles', args: [nameResource, ops] }),
  client.readContract({ address: authority.resolver, abi: resolverAbi, functionName: 'roles', args: [globalEndpointResource, ops] }),
]);
if (safeRootRoles !== allRoles || !safeRootAccess) throw new Error('Treasury Safe does not hold all resolver root roles');
if (opsRootRoles !== 0n || !opsEndpointAccess || opsPayeeAccess || opsNameRoles !== 0n || opsGlobalEndpointRoles !== 0n) {
  throw new Error('Ops has missing or excessive resolver access');
}

// Scan every Ops role-change event since the factory deployment event. A partial scan cannot establish exclusivity.
const observed = new Set<bigint>([endpointResource, payeeResource, nameResource, globalEndpointResource, 0n]);
let roleChangeEvents = 0;
for (let fromBlock = deployBlock; fromBlock <= tip; fromBlock += 5000n) {
  const toBlock = fromBlock + 4999n < tip ? fromBlock + 4999n : tip;
  const logs = await client.getLogs({ address: authority.resolver, event: roleEvent,
    args: { account: ops }, fromBlock, toBlock });
  roleChangeEvents += logs.length;
  for (const log of logs) observed.add(log.args.resource!);
}
const currentOpsRoles = await Promise.all([...observed].map(async id => ({
  resource: id,
  roles: await client.readContract({ address: authority.resolver, abi: resolverAbi,
    functionName: 'roles', args: [id, ops] }),
})));
for (const entry of currentOpsRoles) {
  const expected = entry.resource === endpointResource ? setText : 0n;
  if (entry.roles !== expected) throw new Error(`Ops has unexpected roles on resource ${entry.resource}`);
}
process.stdout.write(JSON.stringify({
  network: 'Sepolia', checkedThroughBlock: tip.toString(), serviceName: name,
  endpoint: authority.endpoint, payTo: authority.payTo,
  treasurySafe: safe, safeThreshold: safeThreshold.toString(), safeOwnerCount: safeOwners.length,
  ops, parentRegistry, subregistry, subregistryImplementation: registryProxyImplementation,
  resolver: authority.resolver, resolverImplementation: implementation,
  resolverDeployBlock: deployBlock.toString(), opsRoleChangeEvents: roleChangeEvents,
  opsEndpointResource: endpointResource.toString(), opsEndpointRoleBitmap: setText.toString(),
  safeRootRoleBitmap: safeRootRoles.toString(), parentRegistryRoleBitmap: parentSafeRoles.toString(),
  serviceRegistryRoleBitmap: serviceRegistryRoles.toString(),
  verified: true,
}, null, 2) + '\n');
import '../load-env';
