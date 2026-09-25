import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';

const authority = {
  name: `payment-${randomUUID()}.hufu402.eth`,
  endpoint: 'https://merchant.example/search',
  payTo: '0x1111111111111111111111111111111111111111' as const,
  resolver: '0x2222222222222222222222222222222222222222' as const,
  implementation: '0x3333333333333333333333333333333333333333' as const,
};
const risk = vi.hoisted(() => ({ tier: 'low' as 'low' | 'medium' }));

vi.mock('@hufu402/sdk', async importOriginal => {
  const sdk = await importOriginal<typeof import('@hufu402/sdk')>();
  return { ...sdk, createEnsClient: () => ({}), resolveServiceAuthority: async () => authority };
});
vi.mock('../src/lib/risk', () => ({
  getRisk: async () => ({ tier: risk.tier, score: 0, reasons: [], scannedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString() }),
}));

import { paymentIntentMessage } from '@hufu402/sdk';
import { authorizePayment, recordSettlement } from '../src/lib/policy';
import { beginApproval } from '../src/lib/world';
import { database } from '../src/lib/db';

const account = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const ownerId = randomUUID();
const policyOrigin = 'https://policy.example';
const payTo = authority.payTo;

function intent(attemptId = randomUUID(), amountAtomic = '100') {
  return {
    attemptId, payer: account.address, serviceName: authority.name,
    resourceUrl: authority.endpoint, payTo, amountAtomic,
    issuedAt: Date.now(), policyOrigin,
  };
}
async function signed(payment: ReturnType<typeof intent>) {
  return { intent: payment, signature: await account.signMessage({ message: paymentIntentMessage(payment) }) };
}

describe.skipIf(!process.env.DATABASE_URL)('policy database idempotency', () => {
  beforeAll(async () => {
    process.env.POLICY_ORIGIN = policyOrigin;
    process.env.SEPOLIA_RPC_URL = 'https://sepolia.example';
    process.env.HUFU_PER_PAYMENT_CAP_ATOMIC = '1000';
    process.env.HUFU_DAILY_CAP_ATOMIC = '10000';
    process.env.HUFU_LARGE_PAYEE_ATOMIC = '5000';
    process.env.WORLD_CLIENT_ID = 'test-client';
    await database().query('INSERT INTO owners (id,issuer,subject) VALUES ($1,$2,$3)', [ownerId, 'test-issuer', ownerId]);
    await database().query('INSERT INTO agents (wallet,owner_id) VALUES ($1,$2)', [account.address.toLowerCase(), ownerId]);
  });
  afterAll(async () => {
    if (!process.env.DATABASE_URL) return;
    await database().query('DELETE FROM reservations WHERE owner_id=$1', [ownerId]);
    await database().query('DELETE FROM world_flows WHERE owner_id=$1', [ownerId]);
    await database().query('DELETE FROM approvals WHERE owner_id=$1', [ownerId]);
    await database().query('DELETE FROM grants WHERE owner_id=$1', [ownerId]);
    await database().query('DELETE FROM payee_observations WHERE service_name=$1', [authority.name]);
    await database().query('DELETE FROM agents WHERE owner_id=$1', [ownerId]);
    await database().query('DELETE FROM owners WHERE id=$1', [ownerId]);
    await database().end();
  });

  it('reuses a pending approval but issues a reservation only once for the signed attempt', async () => {
    const payment = await signed(intent());
    const first = await authorizePayment(payment);
    const retry = await authorizePayment(payment);
    expect(first.allowed).toBe(false);
    expect(retry.approvalUrl).toBe(first.approvalUrl);
    const approvalId = first.approvalUrl?.split('/').at(-1);
    expect(approvalId).toBeTruthy();
    await database().query("UPDATE approvals SET status='approved' WHERE id=$1", [approvalId]);
    await database().query(
      `INSERT INTO grants (id,owner_id,agent_wallet,service_name,network,pay_to,daily_cap_atomic,expires_at,approved_by_issuer,approved_by_subject)
       VALUES ($1,$2,$3,$4,'eip155:84532',$5,10000,now()+interval '30 days','test-issuer',$6)`,
      [randomUUID(),ownerId,account.address.toLowerCase(),authority.name,payTo.toLowerCase(),ownerId],
    );
    const allowed = await authorizePayment(payment);
    const allowedRetry = await authorizePayment(payment);
    expect(allowed.allowed).toBe(true);
    expect(allowedRetry).toMatchObject({ allowed: false, reason: 'Payment attempt is already reserved' });
    const changed = await signed({ ...payment.intent, amountAtomic: '101' });
    expect((await authorizePayment(changed)).reason).toMatch(/Attempt ID was reused/);
    expect((await recordSettlement({ ...payment, reservationId: allowed.reservationId, outcome: 'uncertain' })).status).toBe('uncertain');
    expect((await authorizePayment(payment)).reason).toMatch(/already uncertain/);
  });

  it('accepts the original signed intent through a two-person approval window but rejects stale or future intents', async () => {
    const recent = await signed({ ...intent(), issuedAt: Date.now() - 31 * 60 * 1000 });
    expect((await authorizePayment(recent)).allowed).toBe(true);
    const stale = await signed({ ...intent(), issuedAt: Date.now() - 36 * 60 * 1000 });
    await expect(authorizePayment(stale)).rejects.toThrow('Payment intent expired');
    const future = await signed({ ...intent(), issuedAt: Date.now() + 60 * 1000 });
    await expect(authorizePayment(future)).rejects.toThrow('Payment intent expired');
  });

  it('allows one approved medium-risk attempt and requires review for the next', async () => {
    risk.tier = 'medium';
    const payment = await signed(intent());
    const first = await authorizePayment(payment);
    expect(first.approvalUrl).toBeTruthy();
    await database().query("UPDATE approvals SET status='approved' WHERE id=$1", [first.approvalUrl?.split('/').at(-1)]);
    expect((await authorizePayment(payment)).allowed).toBe(true);
    expect((await authorizePayment(await signed(intent()))).reason).toMatch(/Medium risk requires approval/);
    risk.tier = 'low';
  });

  it('requires a fresh approval after payee observation changes', async () => {
    await database().query("UPDATE payee_observations SET changed_at=now()+interval '1 second' WHERE service_name=$1", [authority.name]);
    const next = await authorizePayment(await signed(intent()));
    expect(next.allowed).toBe(false);
    expect(next.reason).toMatch(/rotated payee/);
  });

  it('binds a second-person World flow to the current invitation token', async () => {
    const approvalId = randomUUID();
    const inviteToken = randomUUID();
    await database().query(
      `INSERT INTO approvals (id,owner_id,agent_wallet,service_name,resource_url,network,pay_to,amount_atomic,daily_cap_atomic,status,
        requires_second_person,first_subject,second_invite_token,expires_at)
       VALUES ($1,$2,$3,$4,$5,'eip155:84532',$6,100,10000,'pending',true,$7,$8,now()+interval '5 minutes')`,
      [approvalId,ownerId,account.address.toLowerCase(),authority.name,authority.endpoint,payTo.toLowerCase(),ownerId,inviteToken],
    );
    await expect(beginApproval(approvalId, randomUUID())).rejects.toThrow('Second-person invitation required');
    const url = new URL(await beginApproval(approvalId, inviteToken));
    const state = url.searchParams.get('state');
    const flow = await database().query<{ invite_token: string; second_person: boolean }>(
      'SELECT invite_token,second_person FROM world_flows WHERE state=$1', [state],
    );
    expect(flow.rows[0]).toMatchObject({ invite_token: inviteToken, second_person: true });
  });

  it('serializes concurrent payments against one owner daily cap', async () => {
    const concurrentOwner = randomUUID();
    const concurrentAccount = privateKeyToAccount(`0x${'22'.repeat(32)}`);
    process.env.HUFU_PER_PAYMENT_CAP_ATOMIC = '10000';
    try {
      await database().query("UPDATE payee_observations SET changed_at=now()-interval '1 minute' WHERE service_name=$1", [authority.name]);
      await database().query('INSERT INTO owners (id,issuer,subject) VALUES ($1,$2,$3)',
        [concurrentOwner, 'test-issuer', concurrentOwner]);
      await database().query('INSERT INTO agents (wallet,owner_id) VALUES ($1,$2)',
        [concurrentAccount.address.toLowerCase(), concurrentOwner]);
      await database().query(
        `INSERT INTO grants (id,owner_id,agent_wallet,service_name,network,pay_to,daily_cap_atomic,expires_at,approved_by_issuer,approved_by_subject)
         VALUES ($1,$2,$3,$4,'eip155:84532',$5,10000,now()+interval '30 days','test-issuer',$6)`,
        [randomUUID(), concurrentOwner, concurrentAccount.address.toLowerCase(), authority.name, payTo.toLowerCase(), concurrentOwner],
      );
      const signedForConcurrentOwner = async () => {
        const payment = { ...intent(), payer: concurrentAccount.address, amountAtomic: '6000' };
        return { intent: payment, signature: await concurrentAccount.signMessage({ message: paymentIntentMessage(payment) }) };
      };
      const [first, second] = await Promise.all([
        signedForConcurrentOwner().then(authorizePayment),
        signedForConcurrentOwner().then(authorizePayment),
      ]);
      expect([first, second].filter(result => result.allowed)).toHaveLength(1);
      expect([first, second].find(result => !result.allowed)?.reason).toBe('Daily cap exceeded');
      const reserved = await database().query<{ total: string }>(
        `SELECT COALESCE(sum(amount_atomic),0)::text AS total FROM reservations
         WHERE owner_id=$1 AND spend_day=(now() AT TIME ZONE 'UTC')::date AND status='reserved'`, [concurrentOwner],
      );
      expect(reserved.rows[0]?.total).toBe('6000');
    } finally {
      await database().query('DELETE FROM reservations WHERE owner_id=$1', [concurrentOwner]);
      await database().query('DELETE FROM approvals WHERE owner_id=$1', [concurrentOwner]);
      await database().query('DELETE FROM grants WHERE owner_id=$1', [concurrentOwner]);
      await database().query('DELETE FROM agents WHERE owner_id=$1', [concurrentOwner]);
      await database().query('DELETE FROM owners WHERE id=$1', [concurrentOwner]);
      process.env.HUFU_PER_PAYMENT_CAP_ATOMIC = '1000';
    }
  });

  it('authorizes a signed attempt only once under concurrent retries', async () => {
    await database().query("UPDATE payee_observations SET changed_at=now()-interval '1 minute' WHERE service_name=$1", [authority.name]);
    const payment = await signed(intent());
    const [first, second] = await Promise.all([authorizePayment(payment), authorizePayment(payment)]);
    expect([first, second].filter(result => result.allowed)).toHaveLength(1);
    expect([first, second].find(result => !result.allowed)?.reason).toBe('Payment attempt is already reserved');
    const rows = await database().query('SELECT id FROM reservations WHERE attempt_id=$1', [payment.intent.attemptId]);
    expect(rows.rowCount).toBe(1);
  });
});
import '../load-env';
