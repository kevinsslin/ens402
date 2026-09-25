import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { privateKeyToAccount } from 'viem/accounts';
import { APPROVAL_WINDOW_MS, createEnsClient, createHttpPolicyGateway, discoverVerifiedServices, payForService } from '@hufu402/sdk';

config({ path: process.env.HUFU_ENV_FILE ?? fileURLToPath(new URL('../../../.env.local', import.meta.url)), quiet: true });

const key = process.env.PAYER_PRIVATE_KEY;
let serviceName = process.env.SERVICE_ENS_NAME;
let resourceUrl = process.env.MERCHANT_RESOURCE_URL;
let expectedAmountAtomic: bigint | undefined;
const policyOrigin = process.env.POLICY_ORIGIN;
const sepoliaRpc = process.env.SEPOLIA_RPC_URL;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('PAYER_PRIVATE_KEY is required in .env');
if (!policyOrigin || !sepoliaRpc) {
  throw new Error('POLICY_ORIGIN and SEPOLIA_RPC_URL are required');
}
const configuredPolicyOrigin = policyOrigin;
const ensClient = createEnsClient(sepoliaRpc);
const discoverIndex = process.argv.indexOf('--discover');
if (discoverIndex >= 0) {
  const query = process.argv[discoverIndex + 1];
  if (!query || query.startsWith('--')) throw new Error('--discover requires a service search phrase');
  const candidates = await discoverVerifiedServices(query, ensClient);
  if (!candidates[0]) throw new Error('No Bazaar candidate with matching ENS endpoint and payee was found');
  const selected = candidates[0];
  serviceName = selected.serviceName;
  resourceUrl = selected.resourceUrl;
  expectedAmountAtomic = selected.priceAtomic;
  process.stdout.write(`Selected ${selected.catalogName}: ${selected.resourceUrl} at ${selected.priceAtomic} atomic USDC. Bazaar usage is not uptime evidence.\n`);
}
if (!serviceName || !resourceUrl) throw new Error('SERVICE_ENS_NAME and MERCHANT_RESOURCE_URL are required without --discover');
const account = privateKeyToAccount(key as `0x${string}`);
async function waitForWorldApproval(approvalUrl: string): Promise<void> {
  const url = new URL(approvalUrl);
  if (url.origin !== new URL(configuredPolicyOrigin).origin || !/^\/approve\/[0-9a-f-]{36}$/i.test(url.pathname)) {
    throw new Error('Policy returned an invalid World approval link');
  }
  const id = url.pathname.split('/').at(-1);
  const statusUrl = new URL(`/api/approvals/${id}`, configuredPolicyOrigin);
  const deadline = Date.now() + APPROVAL_WINDOW_MS;
  process.stdout.write(`Open this World approval link: ${url.href}\nWaiting up to 30 minutes for approval...\n`);
  while (Date.now() < deadline) {
    const response = await fetch(statusUrl, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`World approval status failed with HTTP ${response.status}`);
    const result = await response.json() as { status?: string; expiresAt?: string };
    if (result.status === 'approved') return;
    if (result.status === 'denied' || result.status === 'expired') throw new Error(`World approval ${result.status}`);
    if (result.status !== 'pending' || !result.expiresAt || !Number.isFinite(Date.parse(result.expiresAt))) {
      throw new Error('World approval status is invalid');
    }
    if (Date.parse(result.expiresAt) <= Date.now()) throw new Error('World approval expired');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('World approval timed out');
}
const response = await payForService({
  serviceName, resourceUrl, policyOrigin, signer: account,
  expectedAmountAtomic,
  ensClient, policy: createHttpPolicyGateway(policyOrigin),
  onApprovalRequired: process.argv.includes('--no-wait') ? undefined : waitForWorldApproval,
  headers: process.argv.includes('--hijack') ? { 'X-HuFu-Demo': 'hijack' } : undefined,
});
process.stdout.write(`HTTP ${response.status}\n`);
process.stdout.write(`${await response.text()}\n`);
