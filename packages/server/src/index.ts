import { createHash } from 'node:crypto';
import { PrivyClient } from '@privy-io/node';
import { createPublicClient, http, type Address, type Hex } from 'viem';
import { sepolia, baseSepolia } from 'viem/chains';
import { resolveService, prepareRecordUpdate, prepareTextPermission, simulateEnsTransaction, recordKeys } from '@ens402/sdk/ens';
import { buildPrivyPolicy, createPrivySigner } from '@ens402/sdk/privy';
import { InterceptaProvider } from '@ens402/sdk/intercepta';
import { purchaseResource } from '@ens402/sdk/http';
import { verifySettlement } from '@ens402/sdk/settlement';
import { normalize } from 'viem/ens';
import { sameAddress, NETWORK } from '@ens402/sdk';
import { Store } from './store';
import { allowedNames, allowedOrigins, amount, requireEnv, uuid } from './config';
import { createResourceTransport } from './transport';

export { authorized, readiness } from './config';
let stored: Store | undefined;
let scanner: InterceptaProvider | undefined;
export const getStore = () => stored ??= new Store(requireEnv('DATABASE_URL'));
export const ensClient = () => createPublicClient({ chain: sepolia, transport: http(requireEnv('SEPOLIA_RPC_URL'), { timeout: 12000, retryCount: 1 }), ccipRead: false });
export const baseClient = () => createPublicClient({ chain: baseSepolia, transport: http(requireEnv('BASE_SEPOLIA_RPC_URL'), { timeout: 12000, retryCount: 1 }) });
export const privy = () => new PrivyClient({ appId: requireEnv('PRIVY_APP_ID'), appSecret: requireEnv('PRIVY_APP_SECRET'), timeout: 15000, maxRetries: 0 });
function serviceName(input: unknown): string {
  if (typeof input !== 'string' || input.length > 255) throw new Error('Enter an ENS service name'); const name = normalize(input); if (name.split('.').length < 2) throw new Error('Enter a complete ENS name'); return name;
}
export async function inspectService(input: unknown) { return resolveService(ensClient(), serviceName(input)); }
export async function createApproval(input: Record<string, unknown>, ownerId = 'operator') {
  const id = uuid(input.id);
  const name = serviceName(input.name);
  const maxAmount = amount(input.maxAmount, process.env.DEMO_MAX_PAYMENT_UNITS || '1000000');
  const dailyLimit = amount(input.dailyLimit, process.env.DEMO_MAX_DAILY_UNITS || '10000000');
  if (BigInt(dailyLimit) < BigInt(maxAmount)) throw new Error('Daily budget must cover at least one payment');
  const duration = input.durationSeconds;
  if (typeof duration !== 'number' || !Number.isInteger(duration) || duration < 600 || duration > 30*86400) throw new Error('Approval duration must be between 10 minutes and 30 days');
  if (!Array.isArray(input.endpoints) || !input.endpoints.length || input.endpoints.length > 5 || input.endpoints.some(x => typeof x !== 'string')) throw new Error('Explicitly approve one to five API URLs');
  const endpoints = input.endpoints as string[];
  const mode = input.mode === 'self' ? 'self' : input.mode === undefined || input.mode === 'hosted' ? 'hosted' : null;
  if (!mode) throw new Error('Select hosted or self signing');
  const payer = mode === 'self' ? String(input.payer) : undefined;
  if (payer && !sameAddress(payer,payer)) throw new Error('Connect a valid payer wallet');
  for (const endpoint of endpoints) { const url = new URL(endpoint); if (url.protocol !== 'https:' || url.href !== endpoint || url.username || url.password || url.hash) throw new Error('Endpoint is outside the configured merchant origins'); }
  const service = await inspectService(name);
  if (service.status !== 'active' || !endpoints.includes(service.endpoint)) throw new Error('Current service endpoint must be explicitly approved');
  // Bind the submitted consent to the configuration the browser actually displayed.
  if (input.authority !== service.authority || !sameAddress(String(input.payTo), service.payment.payTo)) throw new Error('Service changed since inspection; review and approve again');
  const fingerprint = createHash('sha256').update(JSON.stringify({ ownerId, mode, payer, name, authority: service.authority, payTo: service.payment.payTo, endpoints: [...endpoints].sort(), maxAmount, dailyLimit, duration })).digest('hex');
  const store = getStore();
  const row = await store.createApproval({ id, fingerprint, service, dailyLimit, ownerId, mode, payer, approval: { name, authority: service.authority, endpoints, payTo: service.payment.payTo, maxAmount, expiresAt: Math.floor(Date.now()/1000) + duration } });
  return mode === 'self' ? row : provisionApproval(row);
}
async function provisionApproval(row: Awaited<ReturnType<Store['getApproval']>>) {
  const id = row.id;
  const store = getStore();
  if (row.state === 'active') return row;
  if (row.approval.expiresAt <= Math.floor(Date.now()/1000) || Date.now() - new Date(row.created_at).getTime() >= 23*3600000) throw new Error('Provisioning window expired; revoke and create a new approval');
  if (row.state !== 'provisioning') throw new Error('Approval cannot be activated');
  const client = privy();
  const policy = await client.policies().create({ ...buildPrivyPolicy(row.approval), idempotency_key: `${id}-policy` });
  const wallet = await client.wallets().create({ chain_type: 'ethereum', policy_ids: [policy.id], idempotency_key: `${id}-wallet` });
  return store.activate(id, wallet.id, wallet.address, policy.id);
}
export async function resumeApproval(input: unknown) { return provisionApproval(await getStore().getApproval(uuid(input))); }
export async function revokeApproval(input: unknown) {
  const id = uuid(input); const store = getStore(); const row = await store.getApproval(id);
  // Stop our execution path first, even if provider policy administration is unavailable.
  await store.revoke(id);
  if (row.policy_id) await privy().policies().update(row.policy_id, { rules: [{ name: 'Revoked by buyer', method: '*', action: 'DENY', conditions: [] }] });
  return { revoked: true, note: 'Already issued authorizations remain valid until used or expired.' };
}
export async function executePurchase(input: Record<string, unknown>, guard: () => Promise<void> = async () => {}) {
  const id = uuid(input.id), approvalId = uuid(input.approvalId);
  const store = getStore(); const row = await store.getApproval(approvalId);
  if (row.mode !== 'hosted') throw new Error('Use external signing for this approval');
  if (!row.wallet_id || !row.payer || !row.policy_id) throw new Error('Approval wallet is not ready');
  const reserved = await store.reserve(id, approvalId, Math.floor(Date.now()/1000));
  if (!reserved.created) return reserved.execution;
  const client = privy();
  try {
    const wallet = await client.wallets().get(row.wallet_id);
    if (!sameAddress(wallet.address, row.payer) || wallet.policy_ids.length !== 1 || wallet.policy_ids[0] !== row.policy_id) throw new Error('Wallet policy binding changed');
    const activePolicy = await client.policies().get(row.policy_id);
    const canonical = (value: unknown): string => {
      if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
      if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
      return JSON.stringify(value);
    };
    const rules = (items: typeof activePolicy.rules) => items.map(({ method, action, conditions }) => ({ method, action, conditions }));
    const expectedRules = buildPrivyPolicy(row.approval).rules.map(({ method, action, conditions }) => ({ method, action, conditions }));
    if (canonical(rules(activePolicy.rules)) !== canonical(expectedRules)) throw new Error('Wallet policy terms changed');
    const providerSigner = createPrivySigner({ client, walletId: row.wallet_id, address: row.payer as Address, scope: row.approval });
    const signer = { address: providerSigner.address, signTypedData: async (data: Parameters<typeof providerSigner.signTypedData>[0]) => { await guard(); const current = await store.getApproval(approvalId); if (current.state !== 'active') throw new Error('Approval revoked'); return providerSigner.signTypedData(data); } };
    scanner ??= new InterceptaProvider({ apiKey: requireEnv('INTERCEPTA_API_KEY') });
    const receipt = await purchaseResource({ name: row.approval.name, approval: row.approval, resolve: inspectService, signer, screen: address => scanner!.screen(address), transport: createResourceTransport(row.approval.endpoints.map(endpoint => new URL(endpoint).origin)), beforeSubmit: async (authorization, requirement) => { await guard(); await store.beforeSubmit(id, authorization, requirement); }, verifySettlement: (settlement, authorization, requirement) => verifySettlement(baseClient(), settlement, authorization, requirement) });
    return store.finish(id, receipt);
  } catch {
    // A database write may fail after submission. Never release a submitting reservation.
    const current = await store.getExecution(id);
    if (current.state !== 'reserved') return current;
    return store.finish(id, { state: 'held', reason: 'Provider setup is unavailable; no payment submitted', steps: [{ stage: 'setup', detail: 'Review server configuration and wallet policy' }] });
  }
}
export async function reconcilePurchase(input: Record<string, unknown>) {
  const id = uuid(input.id);
  if (typeof input.transaction !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(input.transaction)) throw new Error('A transaction hash is required');
  const store = getStore(); const execution = await store.getExecution(id);
  if (!['submitting','uncertain'].includes(execution.state) || !execution.authorization || !execution.requirement) throw new Error('Execution does not need settlement reconciliation');
  const settlement = { success: true, network: NETWORK, transaction: input.transaction as Hex, payer: execution.authorization.from };
  await verifySettlement(baseClient(), settlement, execution.authorization, execution.requirement);
  return store.finish(id, { ...execution.receipt, state: 'paid_delivery_failed', reason: 'Payment independently confirmed; resource delivery has not been verified', authorization: execution.authorization, requirement: execution.requirement, settlement, steps: [...(execution.receipt?.steps ?? []), { stage: 'reconcile', detail: 'Matched USDC transfer and authorization nonce on Base Sepolia' }] });
}
export async function ensTransaction(input: Record<string, unknown>) {
  const service = await inspectService(input.name);
  const key = recordKeys.find(key => key === input.key); if (!key) throw new Error('Select a supported ENS record');
  const from = String(input.from) as Address;
  if (!sameAddress(from,from)) throw new Error('Connect a Sepolia administrator or operator wallet');
  const transaction = input.action === 'set' ? prepareRecordUpdate(service,key,String(input.value)) : ['grant','revoke'].includes(String(input.action)) ? prepareTextPermission(service,key,String(input.operator) as Address,input.action === 'grant') : null;
  if (!transaction) throw new Error('Select set, grant or revoke');
  return { transaction, ...(await simulateEnsTransaction(ensClient(),from,transaction)), observedBlock: service.block, note: 'Simulation is advisory. The native ENS contract checks permissions again when the wallet submits.' };
}
export async function walletBalance(input: unknown) {
  const row = await getStore().getApproval(uuid(input));
  if (!row.payer) throw new Error('Wallet is not configured');
  const { parseAbi } = await import('viem'); const { USDC } = await import('@ens402/sdk');
  const client = baseClient();
  if (await client.getChainId() !== 84532) throw new Error('Wrong payment network');
  const balance = await client.readContract({ address: USDC, abi: parseAbi(['function balanceOf(address) view returns (uint256)']), functionName: 'balanceOf', args: [row.payer as Address] });
  return { address: row.payer, network: NETWORK, asset: USDC, units: balance.toString() };
}

export async function cancelUnsentPurchase(input: unknown) { return getStore().cancelReserved(uuid(input)); }

export async function screenRecipient(address: string) { scanner ??= new InterceptaProvider({ apiKey: requireEnv('INTERCEPTA_API_KEY') }); return scanner.screen(address); }
