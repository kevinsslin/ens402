import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { privateKeyToAccount } from 'viem/accounts';
import { database } from '../src/lib/db';
import { beginApproval, beginEnrollment, confirmEnrollment, finishWorldFlow } from '../src/lib/world';

const issuer = 'https://sandbox.auth.world.org';
const ownerWallet = privateKeyToAccount(`0x${'33'.repeat(32)}`);
const secondWallet = privateKeyToAccount(`0x${'44'.repeat(32)}`);
const ownerSubject = `test-owner-${randomUUID()}`;
const secondSubject = `test-second-${randomUUID()}`;
const tokens = new Map<string, string>();
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
let publicJwk: JWK;
let ownerId: string | undefined;
let secondOwnerId: string | undefined;

async function token(subject: string, nonce: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ nonce, auth_time: now, acr: 'https://world.org/oidc/acr/orb-v3', amr: ['pop'] })
    .setProtectedHeader({ alg: 'RS256', kid: 'local-test-key' })
    .setIssuer(issuer).setAudience('test-world-client').setSubject(subject)
    .setIssuedAt(now).setExpirationTime(now + 300).sign(privateKey);
}

describe.skipIf(!process.env.DATABASE_URL)('World OIDC database flow', () => {
  beforeAll(async () => {
    process.env.POLICY_ORIGIN = 'https://policy.example';
    process.env.WORLD_CLIENT_ID = 'test-world-client';
    process.env.WORLD_CLIENT_SECRET = 'local-test-secret';
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    publicJwk = { ...await exportJWK(pair.publicKey), kid: 'local-test-key', alg: 'RS256', use: 'sig' };
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === '/.well-known/jwks.json') {
        return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.pathname === '/api/v1/token') {
        const code = init?.body instanceof URLSearchParams ? init.body.get('code') : null;
        const idToken = code ? tokens.get(code) : undefined;
        if (!code || !idToken) return new Response('{}', { status: 400 });
        tokens.delete(code);
        return new Response(JSON.stringify({ id_token: idToken }), { status: 200,
          headers: { 'content-type': 'application/json' } });
      }
      throw new Error(`Unexpected World test request: ${url.href}`);
    }));
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    if (!process.env.DATABASE_URL) return;
    if (ownerId) {
      await database().query('DELETE FROM grants WHERE owner_id=$1', [ownerId]);
      await database().query('DELETE FROM world_flows WHERE owner_id=$1 OR agent_wallet=$2', [ownerId, ownerWallet.address.toLowerCase()]);
      await database().query('DELETE FROM approvals WHERE owner_id=$1', [ownerId]);
      await database().query('DELETE FROM agents WHERE owner_id=$1', [ownerId]);
      await database().query('DELETE FROM owners WHERE id=$1', [ownerId]);
    } else {
      await database().query('DELETE FROM world_flows WHERE agent_wallet=$1', [ownerWallet.address.toLowerCase()]);
    }
    if (secondOwnerId) {
      await database().query('DELETE FROM world_flows WHERE owner_id=$1 OR agent_wallet=$2', [secondOwnerId, secondWallet.address.toLowerCase()]);
      await database().query('DELETE FROM agents WHERE owner_id=$1', [secondOwnerId]);
      await database().query('DELETE FROM owners WHERE id=$1', [secondOwnerId]);
    } else {
      await database().query('DELETE FROM world_flows WHERE agent_wallet=$1', [secondWallet.address.toLowerCase()]);
    }
    await database().end();
  });

  it('enrolls a signed wallet, grants an exact payment, and rejects callback replay', async () => {
    const enrollment = await beginEnrollment(ownerWallet.address);
    const signature = await ownerWallet.signMessage({ message: enrollment.message });
    const enrollUrl = new URL(await confirmEnrollment(enrollment.state, signature));
    expect(enrollUrl.searchParams.get('code_challenge_method')).toBe('S256');
    const enrollNonce = enrollUrl.searchParams.get('nonce');
    expect(enrollNonce).toBeTruthy();
    tokens.set('enroll', await token(ownerSubject, enrollNonce!));
    expect(await finishWorldFlow(enrollment.state, 'enroll')).toBe('/enroll/done');
    const agent = await database().query<{ owner_id: string }>('SELECT owner_id FROM agents WHERE wallet=$1', [ownerWallet.address.toLowerCase()]);
    ownerId = agent.rows[0]?.owner_id;
    expect(ownerId).toBeTruthy();

    const approvalId = randomUUID();
    await database().query(
      `INSERT INTO approvals (id,owner_id,agent_wallet,service_name,resource_url,network,pay_to,amount_atomic,daily_cap_atomic,status,expires_at)
       VALUES ($1,$2,$3,'search.hufu402.eth','https://merchant.example/search','eip155:84532',$4,1000,10000,'pending',now()+interval '5 minutes')`,
      [approvalId, ownerId, ownerWallet.address.toLowerCase(), '0x1111111111111111111111111111111111111111'],
    );
    const approvalUrl = new URL(await beginApproval(approvalId));
    const approvalNonce = approvalUrl.searchParams.get('nonce');
    expect(approvalNonce).toBeTruthy();
    tokens.set('approval', await token(ownerSubject, approvalNonce!));
    expect(await finishWorldFlow(approvalUrl.searchParams.get('state')!, 'approval')).toBe(`/approve/${approvalId}`);
    const approval = await database().query<{ status: string }>('SELECT status FROM approvals WHERE id=$1', [approvalId]);
    expect(approval.rows[0]?.status).toBe('approved');
    const grant = await database().query<{ service_name: string; pay_to: string }>('SELECT service_name,pay_to FROM grants WHERE owner_id=$1', [ownerId]);
    expect(grant.rows[0]).toMatchObject({ service_name: 'search.hufu402.eth', pay_to: '0x1111111111111111111111111111111111111111' });
    await expect(finishWorldFlow(approvalUrl.searchParams.get('state')!, 'approval')).rejects.toThrow('World flow expired or incomplete');

    const wrongOwnerApprovalId = randomUUID();
    await database().query(
      `INSERT INTO approvals (id,owner_id,agent_wallet,service_name,resource_url,network,pay_to,amount_atomic,daily_cap_atomic,status,expires_at)
       VALUES ($1,$2,$3,'search.hufu402.eth','https://merchant.example/search','eip155:84532',$4,1000,10000,'pending',now()+interval '5 minutes')`,
      [wrongOwnerApprovalId, ownerId, ownerWallet.address.toLowerCase(), '0x1111111111111111111111111111111111111111'],
    );
    const wrongOwnerUrl = new URL(await beginApproval(wrongOwnerApprovalId));
    const wrongOwnerState = wrongOwnerUrl.searchParams.get('state')!;
    const wrongOwnerNonce = wrongOwnerUrl.searchParams.get('nonce')!;
    tokens.set('wrong-owner', await token(`wrong-${ownerSubject}`, wrongOwnerNonce));
    await expect(finishWorldFlow(wrongOwnerState, 'wrong-owner')).rejects.toThrow('Wrong World owner');
    const pending = await database().query<{ status: string }>('SELECT status FROM approvals WHERE id=$1', [wrongOwnerApprovalId]);
    expect(pending.rows[0]?.status).toBe('pending');
    tokens.set('correct-owner', await token(ownerSubject, wrongOwnerNonce));
    expect(await finishWorldFlow(wrongOwnerState, 'correct-owner')).toBe(`/approve/${wrongOwnerApprovalId}`);
  });

  it('requires a second enrolled World subject for a large new payee', async () => {
    expect(ownerId).toBeTruthy();
    const returnPath = `/approve/${randomUUID()}?invite=${randomUUID()}`;
    const enrollment = await beginEnrollment(secondWallet.address, returnPath);
    const signature = await secondWallet.signMessage({ message: enrollment.message });
    const enrollUrl = new URL(await confirmEnrollment(enrollment.state, signature));
    tokens.set('enroll-second', await token(secondSubject, enrollUrl.searchParams.get('nonce')!));
    expect(await finishWorldFlow(enrollment.state, 'enroll-second')).toBe(returnPath);
    const enrolled = await database().query<{ owner_id: string }>('SELECT owner_id FROM agents WHERE wallet=$1', [secondWallet.address.toLowerCase()]);
    secondOwnerId = enrolled.rows[0]?.owner_id;
    expect(secondOwnerId).toBeTruthy();

    const approvalId = randomUUID();
    await database().query(
      `INSERT INTO approvals (id,owner_id,agent_wallet,service_name,resource_url,network,pay_to,amount_atomic,daily_cap_atomic,status,requires_second_person,expires_at)
       VALUES ($1,$2,$3,'large.hufu402.eth','https://merchant.example/large','eip155:84532',$4,6000,10000,'pending',true,now()+interval '5 minutes')`,
      [approvalId, ownerId, ownerWallet.address.toLowerCase(), '0x5555555555555555555555555555555555555555'],
    );
    const firstUrl = new URL(await beginApproval(approvalId));
    tokens.set('first-person', await token(ownerSubject, firstUrl.searchParams.get('nonce')!));
    const invitePath = await finishWorldFlow(firstUrl.searchParams.get('state')!, 'first-person');
    const invite = new URL(invitePath, 'https://policy.example').searchParams.get('invite');
    expect(invite).toBeTruthy();
    const firstOnly = await database().query<{ status: string; first_subject: string }>('SELECT status,first_subject FROM approvals WHERE id=$1', [approvalId]);
    expect(firstOnly.rows[0]).toMatchObject({ status: 'pending', first_subject: ownerSubject });
    const grantsBeforeSecond = await database().query<{ count: string }>("SELECT count(*)::text AS count FROM grants WHERE owner_id=$1 AND service_name='large.hufu402.eth'", [ownerId]);
    expect(grantsBeforeSecond.rows[0]?.count).toBe('0');

    const secondUrl = new URL(await beginApproval(approvalId, invite!));
    const secondState = secondUrl.searchParams.get('state')!;
    const secondNonce = secondUrl.searchParams.get('nonce')!;
    tokens.set('same-person', await token(ownerSubject, secondNonce));
    await expect(finishWorldFlow(secondState, 'same-person')).rejects.toThrow('distinct second World identity');
    tokens.set('second-person', await token(secondSubject, secondNonce));
    expect(await finishWorldFlow(secondState, 'second-person')).toBe(`/approve/${approvalId}`);
    const approved = await database().query<{ status: string }>('SELECT status FROM approvals WHERE id=$1', [approvalId]);
    expect(approved.rows[0]?.status).toBe('approved');
    const grantsAfterSecond = await database().query<{ count: string }>("SELECT count(*)::text AS count FROM grants WHERE owner_id=$1 AND service_name='large.hufu402.eth'", [ownerId]);
    expect(grantsAfterSecond.rows[0]?.count).toBe('1');
  });
});
import '../load-env';
