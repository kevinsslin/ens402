import {
  concat, createPublicClient, encodeAbiParameters, encodeFunctionData, getAddress,
  getCreate2Address, http, isAddress, keccak256, namehash, parseAbi, stringToHex, toHex,
} from 'viem';
import { packetToBytes } from 'viem/ens';
import { sepolia } from 'viem/chains';
import {
  BASE_SEPOLIA_COIN_TYPE, ENDPOINT_RECORD_KEY, ENS_V2_FACTORY,
  ENS_V2_PERMISSIONED_RESOLVER_IMPL, canonicalResourceUrl,
} from '@hufu402/sdk';

const rpc = process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const factoryAbi = parseAbi([
  'function deployProxy(address implementation,uint256 salt,bytes data) returns (address proxy)',
  'function proxyLogic() view returns (address)',
  'function verifyContract(address proxy) view returns (address implementation)',
]);
const resolverAbi = parseAbi([
  'function initialize(address admin,uint256 roleBitmap,bytes[] setters)',
  'function setText(bytes32 node,string key,string value)',
  'function setAddr(bytes32 node,uint256 coinType,bytes addressBytes)',
  'function authorizeTextRoles(bytes toName,string key,address account,bool grant)',
]);
const registryAbi = parseAbi([
  'function initialize(address rootAccount,uint256 roleBitmap)',
  'function setParent(address parent,string label)',
  'function register(string label,address owner,address subregistry,address resolver,uint256 roleBitmap,uint64 expiry)',
]);
const parentAbi = parseAbi(['function getExpiry(uint256 anyId) view returns (uint64)']);
const registrarAbi = parseAbi([
  'function isAvailable(string label) view returns (bool)',
  'function MIN_COMMITMENT_AGE() view returns (uint64)',
  'function MAX_COMMITMENT_AGE() view returns (uint64)',
  'function MIN_REGISTER_DURATION() view returns (uint64)',
  'function getRegisterPrice(string label,uint64 duration,address paymentToken) view returns (uint256 base,uint256 premium)',
  'function makeCommitment(string label,address owner,bytes32 secret,address subregistry,address resolver,uint64 duration,bytes32 referrer) pure returns (bytes32)',
  'function commitmentAt(bytes32 commitment) view returns (uint64)',
  'function commit(bytes32 commitment)',
  'function register(string label,address owner,bytes32 secret,address subregistry,address resolver,uint64 duration,address paymentToken,bytes32 referrer) returns (uint256)',
]);
const erc20Abi = parseAbi(['function approve(address spender,uint256 value) returns (bool)']);
const safeAbi = parseAbi([
  'function getThreshold() view returns (uint256)',
  'function getOwners() view returns (address[])',
]);
const allRoles = BigInt('0x' + '1'.repeat(64));
const zero = '0x0000000000000000000000000000000000000000' as const;
const zeroHash = '0x' + '00'.repeat(32) as `0x${string}`;

function requiredAddress(name: string): `0x${string}` {
  const value = process.env[name];
  if (!value || !isAddress(value)) throw new Error(`${name} must be a valid address`);
  return getAddress(value);
}
async function deployedAddress(name: string): Promise<`0x${string}`> {
  const response = await fetch(`https://raw.githubusercontent.com/ensdomains/contracts-v2/main/contracts/deployments/sepolia/${name}.json`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`${name} deployment fetch failed`);
  const body = await response.json() as { address: string };
  if (!isAddress(body.address)) throw new Error(`${name} deployment address is invalid`);
  return getAddress(body.address);
}
function salt(kind: 'OwnedResolver' | 'UserRegistry', subject: `0x${string}`): bigint {
  const kindHash = keccak256(stringToHex(kind));
  return BigInt(keccak256(encodeAbiParameters(
    [{ type: 'bytes32' }, { type: kind === 'OwnedResolver' ? 'address' : 'bytes32' }, { type: 'uint256' }],
    [kindHash, subject, 0n],
  )));
}
function predictedProxy(logic: `0x${string}`, deployer: `0x${string}`, innerSalt: bigint): `0x${string}` {
  const outerSalt = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [deployer, innerSalt]));
  const initCode = concat([
    '0x3d604d80600a3d3981f3363d3d373d3d3d363d73', logic,
    '0x5af43d82803e903d91602b57fd5bf3', outerSalt,
  ]);
  return getCreate2Address({ from: ENS_V2_FACTORY, salt: outerSalt, bytecodeHash: keccak256(initCode) });
}
function tx(label: string, to: `0x${string}`, data: `0x${string}`) {
  return { label, chainId: 11155111, to, value: '0', data };
}

const safe = requiredAddress('TREASURY_SAFE_ADDRESS');
const ops = requiredAddress('ENS_OPS_ADDRESS');
const payTo = requiredAddress('X402_PAY_TO');
const serviceName = process.env.SERVICE_ENS_NAME;
const resourceUrl = process.env.MERCHANT_RESOURCE_URL;
if (!serviceName || !resourceUrl) throw new Error('SERVICE_ENS_NAME and MERCHANT_RESOURCE_URL are required');
const labels = serviceName.split('.');
if (labels.length !== 3 || labels[2] !== 'eth') throw new Error('SERVICE_ENS_NAME must be a direct subname of a .eth name');
const [serviceLabel, parentLabel] = labels as [string, string, string];
const endpoint = canonicalResourceUrl(resourceUrl);
const client = createPublicClient({ chain: sepolia, transport: http(rpc, { timeout: 10000 }) });
const safeCode = await client.getBytecode({ address: safe });
let safeStatus: { deployed: boolean; threshold?: string; ownerCount?: number } = { deployed: false };
if (safeCode && safeCode !== '0x') {
  const [threshold, owners] = await Promise.all([
    client.readContract({ address: safe, abi: safeAbi, functionName: 'getThreshold' }),
    client.readContract({ address: safe, abi: safeAbi, functionName: 'getOwners' }),
  ]);
  if (threshold !== 2n || owners.length !== 3) throw new Error('Treasury Safe must have a 2-of-3 owner configuration');
  safeStatus = { deployed: true, threshold: threshold.toString(), ownerCount: owners.length };
}
const [registryImpl, parentRegistry, logic] = await Promise.all([
  deployedAddress('UserRegistryImpl'), deployedAddress('ETHRegistry'),
  client.readContract({ address: ENS_V2_FACTORY, abi: factoryAbi, functionName: 'proxyLogic' }),
]);
const resolverSalt = salt('OwnedResolver', safe);
const registrySalt = salt('UserRegistry', namehash(`${parentLabel}.eth`));
const resolver = predictedProxy(logic, safe, resolverSalt);
const registry = predictedProxy(logic, safe, registrySalt);
const registryCode = await client.getBytecode({ address: registry });
const resolverInit = encodeFunctionData({ abi: resolverAbi, functionName: 'initialize', args: [safe, allRoles, []] });
const registryInit = encodeFunctionData({ abi: registryAbi, functionName: 'initialize', args: [safe, allRoles] });

for (const [proxy, implementation, innerSalt, data] of [
  [resolver, ENS_V2_PERMISSIONED_RESOLVER_IMPL, resolverSalt, resolverInit],
  [registry, registryImpl, registrySalt, registryInit],
] as const) {
  const code = await client.getBytecode({ address: proxy });
  if (code && code !== '0x') {
    const actual = await client.readContract({ address: ENS_V2_FACTORY, abi: factoryAbi, functionName: 'verifyContract', args: [proxy] });
    if (getAddress(actual) !== getAddress(implementation)) throw new Error(`Existing proxy ${proxy} has an unexpected implementation`);
  } else {
    const simulation = await client.simulateContract({ account: safe, address: ENS_V2_FACTORY, abi: factoryAbi,
      functionName: 'deployProxy', args: [implementation, innerSalt, data] });
    if (getAddress(simulation.result) !== getAddress(proxy)) throw new Error(`Factory simulation disagrees with predicted proxy ${proxy}`);
  }
}

const parentExpiry = await client.readContract({ address: parentRegistry, abi: parentAbi,
  functionName: 'getExpiry', args: [BigInt(keccak256(stringToHex(parentLabel)))] });
const serviceExpiry = registryCode && registryCode !== '0x'
  ? await client.readContract({ address: registry, abi: parentAbi, functionName: 'getExpiry',
    args: [BigInt(keccak256(stringToHex(serviceLabel)))] })
  : 0n;
const node = namehash(serviceName);
const serviceDns = toHex(packetToBytes(serviceName));
const deployment = [
  tx('Deploy Safe-owned resolver proxy', ENS_V2_FACTORY, encodeFunctionData({ abi: factoryAbi, functionName: 'deployProxy',
    args: [ENS_V2_PERMISSIONED_RESOLVER_IMPL, resolverSalt, resolverInit] })),
  tx('Deploy Safe-owned subname registry proxy', ENS_V2_FACTORY, encodeFunctionData({ abi: factoryAbi, functionName: 'deployProxy',
    args: [registryImpl, registrySalt, registryInit] })),
];
const afterParentRegistration = [
  tx('Set subname registry parent', registry, encodeFunctionData({ abi: registryAbi, functionName: 'setParent', args: [parentRegistry, parentLabel] })),
  tx('Set service endpoint', resolver, encodeFunctionData({ abi: resolverAbi, functionName: 'setText', args: [node, ENDPOINT_RECORD_KEY, endpoint] })),
  tx('Set Base Sepolia payee', resolver, encodeFunctionData({ abi: resolverAbi, functionName: 'setAddr', args: [node, BASE_SEPOLIA_COIN_TYPE, payTo] })),
  tx('Grant Ops endpoint-only write access', resolver, encodeFunctionData({ abi: resolverAbi, functionName: 'authorizeTextRoles', args: [serviceDns, ENDPOINT_RECORD_KEY, ops, true] })),
];
if (parentExpiry > BigInt(Math.floor(Date.now() / 1000)) && serviceExpiry <= BigInt(Math.floor(Date.now() / 1000))) {
  const nameRoles = (1n << 20n) | (1n << 24n) | (1n << 148n) | (1n << 152n) | (1n << 156n);
  afterParentRegistration.splice(1, 0, tx('Register service subname', registry, encodeFunctionData({
    abi: registryAbi, functionName: 'register', args: [serviceLabel, safe, zero, resolver, nameRoles, parentExpiry],
  })));
}
let parentRegistration: unknown = null;
const secret = process.env.ENS_COMMIT_SECRET;
if (secret) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(secret)) throw new Error('ENS_COMMIT_SECRET must be a bytes32 hex value');
  const [registrar, mockUsdc] = await Promise.all([deployedAddress('ETHRegistrar'), deployedAddress('MockUSDC')]);
  const paymentToken = process.env.ENS_REGISTRATION_PAYMENT_TOKEN
    ? requiredAddress('ENS_REGISTRATION_PAYMENT_TOKEN') : mockUsdc;
  const duration = BigInt(process.env.ENS_REGISTRATION_DURATION_SECONDS ?? '31536000');
  const [available, minCommitAge, maxCommitAge, minDuration, price] = await Promise.all([
    client.readContract({ address: registrar, abi: registrarAbi, functionName: 'isAvailable', args: [parentLabel] }),
    client.readContract({ address: registrar, abi: registrarAbi, functionName: 'MIN_COMMITMENT_AGE' }),
    client.readContract({ address: registrar, abi: registrarAbi, functionName: 'MAX_COMMITMENT_AGE' }),
    client.readContract({ address: registrar, abi: registrarAbi, functionName: 'MIN_REGISTER_DURATION' }),
    client.readContract({ address: registrar, abi: registrarAbi, functionName: 'getRegisterPrice',
      args: [parentLabel, duration, paymentToken] }),
  ]);
  if (duration < minDuration) throw new Error(`Registration duration is below the minimum ${minDuration}`);
  if (!available) throw new Error(`${parentLabel}.eth is not available for registration`);
  const commitment = await client.readContract({ address: registrar, abi: registrarAbi, functionName: 'makeCommitment',
    args: [parentLabel, safe, secret as `0x${string}`, registry, resolver, duration, zeroHash] });
  const commitTime = await client.readContract({ address: registrar, abi: registrarAbi, functionName: 'commitmentAt', args: [commitment] });
  const age = commitTime === 0n ? null : BigInt(Math.floor(Date.now() / 1000)) - commitTime;
  parentRegistration = {
    registrar, paymentToken, durationSeconds: duration.toString(),
    estimatedCostAtomic: (price[0] + price[1]).toString(),
    commitment, commitTime: commitTime.toString(), minimumCommitAgeSeconds: minCommitAge.toString(),
    maximumCommitAgeSeconds: maxCommitAge.toString(), revealReady: age !== null && age >= minCommitAge && age <= maxCommitAge,
    note: 'Keep this output private until registration. The reveal calldata contains the commitment secret. Confirm the current price and token balance before submission.',
    approveToken: tx('Approve registrar payment token', paymentToken, encodeFunctionData({ abi: erc20Abi,
      functionName: 'approve', args: [registrar, price[0] + price[1]] })),
    commit: tx('Commit parent name registration', registrar, encodeFunctionData({ abi: registrarAbi,
      functionName: 'commit', args: [commitment] })),
    reveal: tx('Register parent name after commitment matures', registrar, encodeFunctionData({ abi: registrarAbi,
      functionName: 'register', args: [parentLabel, safe, secret as `0x${string}`, registry, resolver, duration, paymentToken, zeroHash] })),
  };
}
process.stdout.write(JSON.stringify({
  network: 'Sepolia', safe, safeStatus, ops, payTo, serviceName, endpoint,
  predictedResolver: resolver, predictedSubregistry: registry,
  parentRegistry, parentExpiry: parentExpiry.toString(),
  serviceExpiry: serviceExpiry.toString(),
  note: 'Submit each step through the Treasury Safe after checking its live code, balances, roles, and simulation. Register the parent .eth name with its predicted resolver and subregistry between phases. Rerun this plan after registration to include the subname registration call.',
  deployment, parentRegistration, afterParentRegistration,
}, null, 2) + '\n');
import '../load-env';
