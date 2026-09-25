import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { PrivyClient } from '@privy-io/node';
import type { EthereumTypedDataInput } from '@privy-io/node/resources';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import { buildPrivyPolicy, createPrivySigner, paymentTypes } from '../packages/sdk/src/privy';
import { USDC, NETWORK } from '../packages/sdk/src/index';
import type { Address } from 'viem';
config({ path: '.env', quiet: true });
if (!process.env.PRIVY_APP_ID || !process.env.PRIVY_APP_SECRET) {
  console.error('BLOCKED: set PRIVY_APP_ID and PRIVY_APP_SECRET in root .env. No wallet created.');
  process.exit(2);
}
const client = new PrivyClient({ appId: process.env.PRIVY_APP_ID, appSecret: process.env.PRIVY_APP_SECRET, maxRetries: 0, timeout: 15000 });
const checks: { name: string; status: string }[] = [];
let policyId: string | undefined;
let walletId: string | undefined;
const denyAll = { name: 'ENS402 closed test wallet', version: '1.0' as const, chain_type: 'ethereum' as const, rules: [{ name: 'No signing', method: '*' as const, action: 'DENY' as const, conditions: [] }] };
try {
  const policy = await client.policies().create(denyAll);
  policyId = policy.id;
  const wallet = await client.wallets().create({ chain_type: 'ethereum', policy_ids: [policy.id] });
  walletId = wallet.id;
  const scope = { payTo: wallet.address, maxAmount: '1', expiresAt: Math.floor(Date.now() / 1000) + 300 };
  await client.policies().update(policy.id, buildPrivyPolicy(scope));
  const signer = createPrivySigner({ client, walletId: wallet.id, address: wallet.address as Address, scope });
  await new ExactEvmScheme(signer).createPaymentPayload(2, { scheme: 'exact', network: NETWORK, asset: USDC, payTo: wallet.address, amount: '1', maxTimeoutSeconds: 30, extra: { name: 'USDC', version: '2' } });
  checks.push({ name: 'x402 authorization signed and cryptographically verified', status: 'pass' });
  const base = { domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC }, types: paymentTypes, primary_type: 'TransferWithAuthorization', message: { from: wallet.address, to: wallet.address, value: '1', validAfter: '0', validBefore: String(Math.floor(Date.now() / 1000) + 30), nonce: `0x${'01'.repeat(32)}` } };
  // Call Privy directly: these checks must not be satisfied by local adapter rejection.
  const cases: [string, EthereumTypedDataInput][] = [
    ['wrong recipient', { ...base, message: { ...base.message, to: '0x1111111111111111111111111111111111111111' } }],
    ['wrong chain', { ...base, domain: { ...base.domain, chainId: 1 } }],
    ['wrong token', { ...base, domain: { ...base.domain, verifyingContract: '0x1111111111111111111111111111111111111111' } }],
    ['amount over limit', { ...base, message: { ...base.message, value: '2' } }],
    ['authorization beyond approval', { ...base, message: { ...base.message, validBefore: String(scope.expiresAt + 1) } }],
    ['changed type map', { ...base, types: { ...base.types, Unused: [{ name: 'value', type: 'uint256' }] } }],
  ];
  for (const [name, typed_data] of cases) {
    try {
      await client.wallets().ethereum().signTypedData(wallet.id, { params: { typed_data } });
      checks.push({ name, status: 'FAIL: provider signed' });
    } catch (error) {
      const e = error as { status?: number; message?: string };
      checks.push({ name, status: e.status === 403 && /policy/i.test(e.message ?? '') ? 'pass: provider policy denial' : `inconclusive: HTTP ${e.status ?? 'unavailable'}` });
    }
  }
  try {
    await client.wallets().ethereum().signMessage(wallet.id, { message: 'ENS402 prohibited message test' });
    checks.push({ name: 'personal_sign', status: 'FAIL: provider signed' });
  } catch (error) {
    const e = error as { status?: number; message?: string };
    checks.push({ name: 'personal_sign', status: e.status === 403 && /policy/i.test(e.message ?? '') ? 'pass: provider policy denial' : `inconclusive: HTTP ${e.status ?? 'unavailable'}` });
  }
} catch (error) {
  const e = error as { status?: number };
  checks.push({ name: 'provider setup/signing', status: `failed: HTTP ${e.status ?? 'unavailable'}` });
} finally {
  // Lock the unfunded, disposable test wallet even if any check fails.
  if (policyId) {
    try { await client.policies().update(policyId, denyAll); checks.push({ name: 'restore deny-all', status: 'pass' }); }
    catch { checks.push({ name: 'restore deny-all', status: 'FAILED: lock policy in Privy dashboard' }); }
  }
  const report = { checkedAt: new Date().toISOString(), walletId, policyId, checks, settlement: 'not submitted; wallet never funded; signatures never persisted' };
  await mkdir('docs/validation', { recursive: true });
  await writeFile('docs/validation/privy-live.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (checks.some(c => !c.status.startsWith('pass'))) process.exitCode = 1;
}
