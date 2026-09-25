import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getAddress, isAddress, verifyMessage } from 'viem';
import { database, transaction } from './db';

const issuer = 'https://sandbox.auth.world.org';
const authorizeEndpoint = `${issuer}/api/v1/authorize`;
const tokenEndpoint = `${issuer}/api/v1/token`;
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

function origin(): string {
  const value = process.env.POLICY_ORIGIN;
  if (!value) throw new Error('POLICY_ORIGIN is required');
  return new URL(value).origin;
}
function clientId(): string {
  if (!process.env.WORLD_CLIENT_ID) throw new Error('WORLD_CLIENT_ID is required');
  return process.env.WORLD_CLIENT_ID;
}
function clientSecret(): string {
  if (!process.env.WORLD_CLIENT_SECRET) throw new Error('WORLD_CLIENT_SECRET is required');
  return process.env.WORLD_CLIENT_SECRET;
}
function callbackUrl(): string { return `${origin()}/api/world/callback`; }
function digest(value: string): string { return createHash('sha256').update(value).digest('base64url'); }
function randomSecret(): string { return randomBytes(32).toString('base64url'); }

function authorizationUrl(state: string, nonce: string, verifier: string): string {
  const url = new URL(authorizeEndpoint);
  url.search = new URLSearchParams({
    response_type: 'code', client_id: clientId(), redirect_uri: callbackUrl(),
    scope: 'openid', state, nonce, code_challenge: digest(verifier),
    code_challenge_method: 'S256', max_age: '0', prompt: 'login',
    acr_values: 'https://world.org/oidc/acr/orb-v3',
  }).toString();
  return url.href;
}

export function enrollmentMessage(state: string, wallet: string): string {
  return `HuFu agent enrollment v1\nPolicy origin: ${origin()}\nWallet: ${getAddress(wallet as `0x${string}`).toLowerCase()}\nState: ${state}`;
}

export async function beginEnrollment(wallet: string): Promise<{ state: string; message: string }> {
  if (!isAddress(wallet)) throw new Error('Invalid wallet address');
  const state = randomUUID();
  const verifier = randomSecret();
  const nonce = digest(`${state}:${wallet.toLowerCase()}:${randomSecret()}`);
  const message = enrollmentMessage(state, wallet);
  await database().query(
    `INSERT INTO world_flows (state,kind,agent_wallet,challenge,pkce_verifier,nonce,redirect_path,expires_at)
     VALUES ($1,'enroll',$2,$3,$4,$5,'/enroll/done',now()+interval '10 minutes')`,
    [state, wallet.toLowerCase(), message, verifier, nonce],
  );
  return { state, message };
}

export async function confirmEnrollment(state: string, signature: `0x${string}`): Promise<string> {
  const result = await database().query<{ agent_wallet: string; challenge: string }>(
    `SELECT agent_wallet,challenge FROM world_flows WHERE state=$1 AND kind='enroll' AND consumed_at IS NULL
     AND signature_verified_at IS NULL AND expires_at > now()`, [state],
  );
  const flow = result.rows[0];
  if (!flow) throw new Error('Enrollment flow expired or already used');
  const valid = await verifyMessage({ address: getAddress(flow.agent_wallet as `0x${string}`), message: flow.challenge, signature });
  if (!valid) throw new Error('Invalid wallet signature');
  const ready = await database().query<{ nonce: string; pkce_verifier: string }>(
    `UPDATE world_flows SET signature_verified_at=now() WHERE state=$1 AND signature_verified_at IS NULL
     AND consumed_at IS NULL AND expires_at > now() RETURNING nonce,pkce_verifier`, [state],
  );
  if (!ready.rows[0]) throw new Error('Enrollment flow expired or already used');
  return authorizationUrl(state, ready.rows[0]!.nonce, ready.rows[0]!.pkce_verifier);
}

export async function beginApproval(id: string, inviteToken?: string, action: 'approve' | 'deny' = 'approve'): Promise<string> {
  const approval = await database().query<{
    owner_id: string; agent_wallet: string; service_name: string; resource_url: string;
    pay_to: string; amount_atomic: string; daily_cap_atomic: string; requires_second_person: boolean;
    first_subject: string | null; second_invite_token: string | null;
  }>(
    `SELECT owner_id,agent_wallet,service_name,resource_url,pay_to,amount_atomic,daily_cap_atomic,
       requires_second_person,first_subject,second_invite_token
     FROM approvals WHERE id=$1 AND status='pending' AND expires_at > now()`, [id],
  );
  const row = approval.rows[0];
  if (!row) throw new Error('Approval expired or unavailable');
  const secondPerson = action === 'approve' && !!row.first_subject;
  if (secondPerson && (!inviteToken || inviteToken !== row.second_invite_token)) throw new Error('Second-person invitation required');
  const state = randomUUID();
  const verifier = randomSecret();
  const scope = [id,row.agent_wallet,row.service_name,row.resource_url,row.pay_to,row.amount_atomic,row.daily_cap_atomic,secondPerson ? 'second' : 'owner'].join('|');
  const nonce = digest(`${scope}|${randomSecret()}`);
  await database().query(
    `INSERT INTO world_flows (state,kind,agent_wallet,owner_id,approval_id,pkce_verifier,nonce,redirect_path,expires_at,second_person,invite_token)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '5 minutes',$9,$10)`,
    [state,action,row.agent_wallet,row.owner_id,id,verifier,nonce,`/approve/${id}`,secondPerson,secondPerson ? inviteToken : null],
  );
  return authorizationUrl(state, nonce, verifier);
}

interface WorldIdentity { issuer: string; subject: string; authTime: number }
export function isFreshWorldAuthentication(authTimeSeconds: number, flowStartMs: number, nowMs = Date.now()): boolean {
  const authTimeMs = authTimeSeconds * 1000;
  return authTimeMs >= flowStartMs - 30_000 && authTimeMs <= nowMs + 30_000 && nowMs - authTimeMs <= 300_000;
}
async function exchangeCode(code: string, verifier: string, nonce: string): Promise<WorldIdentity> {
  const credentials = Buffer.from(`${encodeURIComponent(clientId())}:${encodeURIComponent(clientSecret())}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: callbackUrl(), code_verifier: verifier });
  const response = await fetch(tokenEndpoint, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${credentials}` },
    body, cache: 'no-store', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`World token exchange failed with HTTP ${response.status}`);
  const json = await response.json() as { id_token?: string };
  if (!json.id_token) throw new Error('World ID token missing');
  const { payload } = await jwtVerify(json.id_token, jwks, { issuer, audience: clientId(), algorithms: ['RS256'], maxTokenAge: '5m' });
  if (!payload.sub || payload.nonce !== nonce || typeof payload.auth_time !== 'number') throw new Error('World ID token claims are incomplete');
  if (payload.acr !== 'https://world.org/oidc/acr/orb-v3' || !Array.isArray(payload.amr) || !payload.amr.includes('pop')) {
    throw new Error('World proof class is not accepted');
  }
  if (Math.abs(Date.now() / 1000 - payload.auth_time) > 300) throw new Error('World authentication is not fresh');
  return { issuer, subject: payload.sub, authTime: payload.auth_time };
}

export async function finishWorldFlow(state: string, code: string): Promise<string> {
  const result = await database().query<{
    kind: string; agent_wallet: string; approval_id: string | null; owner_id: string | null;
    pkce_verifier: string; nonce: string; redirect_path: string; second_person: boolean; invite_token: string | null;
    signature_verified_at: Date | null; created_at: Date;
  }>(
    `SELECT kind,agent_wallet,approval_id,owner_id,pkce_verifier,nonce,redirect_path,second_person,invite_token,signature_verified_at,created_at
     FROM world_flows WHERE state=$1 AND consumed_at IS NULL AND expires_at > now()`, [state],
  );
  const flow = result.rows[0];
  if (!flow || (flow.kind === 'enroll' && !flow.signature_verified_at)) throw new Error('World flow expired or incomplete');
  const identity = await exchangeCode(code, flow.pkce_verifier, flow.nonce);
  if (!isFreshWorldAuthentication(identity.authTime, flow.created_at.getTime())) throw new Error('World proof predates this request');
  let redirectPath = flow.redirect_path;
  await transaction(async db => {
    const consumed = await db.query('UPDATE world_flows SET consumed_at=now() WHERE state=$1 AND consumed_at IS NULL RETURNING state', [state]);
    if (!consumed.rowCount) throw new Error('World flow replayed');
    if (flow.kind === 'enroll') {
      const owner = await db.query<{ id: string }>('SELECT id FROM owners WHERE issuer=$1 AND subject=$2', [identity.issuer, identity.subject]);
      const ownerId = owner.rows[0]?.id ?? randomUUID();
      if (!owner.rows[0]) await db.query('INSERT INTO owners (id,issuer,subject) VALUES ($1,$2,$3)', [ownerId,identity.issuer,identity.subject]);
      const existing = await db.query<{ owner_id: string }>('SELECT owner_id FROM agents WHERE wallet=$1', [flow.agent_wallet]);
      if (existing.rows[0] && existing.rows[0].owner_id !== ownerId) throw new Error('Wallet belongs to a different World owner');
      if (!existing.rows[0]) await db.query('INSERT INTO agents (wallet,owner_id) VALUES ($1,$2)', [flow.agent_wallet,ownerId]);
      return;
    }
    const approval = await db.query<{
      owner_id: string; requires_second_person: boolean; first_subject: string | null; agent_wallet: string;
      service_name: string; network: string; pay_to: string; daily_cap_atomic: string; second_invite_token: string | null;
    }>('SELECT * FROM approvals WHERE id=$1 AND status=\'pending\' AND expires_at > now() FOR UPDATE', [flow.approval_id]);
    const row = approval.rows[0];
    if (!row || row.owner_id !== flow.owner_id) throw new Error('Approval expired or invalid');
    const owner = await db.query<{ issuer: string; subject: string }>('SELECT issuer,subject FROM owners WHERE id=$1', [row.owner_id]);
    if (flow.kind === 'deny') {
      if (identity.issuer !== owner.rows[0]?.issuer || identity.subject !== owner.rows[0]?.subject) throw new Error('Wrong World owner');
      await db.query('UPDATE approvals SET status=\'denied\' WHERE id=$1', [flow.approval_id]);
      return;
    }
    if (!flow.second_person) {
      if (identity.issuer !== owner.rows[0]?.issuer || identity.subject !== owner.rows[0]?.subject) throw new Error('Wrong World owner');
      if (row.requires_second_person) {
        if (row.first_subject) throw new Error('First approval already recorded');
        const inviteToken = randomUUID();
        await db.query('UPDATE approvals SET first_subject=$2,second_invite_token=$3 WHERE id=$1', [flow.approval_id,identity.subject,inviteToken]);
        redirectPath = `${flow.redirect_path}?invite=${inviteToken}`;
        return;
      }
    } else {
      if (!row.requires_second_person || !row.first_subject || identity.subject === row.first_subject || identity.issuer !== owner.rows[0]?.issuer) {
        throw new Error('A distinct second World identity is required');
      }
      if (!flow.invite_token || flow.invite_token !== row.second_invite_token) {
        throw new Error('Second-person invitation was replaced');
      }
      const enrolled = await db.query<{ id: string }>(
        'SELECT id FROM owners WHERE issuer=$1 AND subject=$2 AND id<>$3',
        [identity.issuer,identity.subject,row.owner_id],
      );
      if (!enrolled.rows[0]) throw new Error('Second World identity must enroll before approval');
    }
    await db.query('UPDATE approvals SET status=\'approved\' WHERE id=$1', [flow.approval_id]);
    await db.query(
      `INSERT INTO grants (id,owner_id,agent_wallet,service_name,network,pay_to,daily_cap_atomic,expires_at,approved_by_issuer,approved_by_subject)
       VALUES ($1,$2,$3,$4,$5,$6,$7,now()+interval '30 days',$8,$9)`,
      [randomUUID(),row.owner_id,row.agent_wallet,row.service_name,row.network,row.pay_to,row.daily_cap_atomic,identity.issuer,identity.subject],
    );
  });
  return redirectPath;
}
