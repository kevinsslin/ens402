import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import type { Approval } from '@ens402/sdk';
import type { ResolvedService } from '@ens402/sdk/ens';
import type { PaymentReceipt, PublicAuthorization } from '@ens402/sdk/http';
import type { PaymentRequirements } from '@x402/core/types';

export const schema = `
CREATE TABLE IF NOT EXISTS ens402_approvals (
  id uuid PRIMARY KEY, fingerprint text NOT NULL, service jsonb NOT NULL, approval jsonb NOT NULL,
  daily_limit numeric(78,0) NOT NULL CHECK (daily_limit > 0), state text NOT NULL,
  wallet_id text, payer text, policy_id text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ens402_executions (
  id uuid PRIMARY KEY, approval_id uuid NOT NULL REFERENCES ens402_approvals(id),
  day date NOT NULL, reserved_amount numeric(78,0) NOT NULL CHECK (reserved_amount >= 0),
  state text NOT NULL, "authorization" jsonb, requirement jsonb, receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ens402_executions_budget ON ens402_executions(approval_id,day);
CREATE TABLE IF NOT EXISTS ens402_merchant_payments (
  nonce_key text PRIMARY KEY, state text NOT NULL, response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE ens402_approvals ADD COLUMN IF NOT EXISTS owner_id text NOT NULL DEFAULT 'operator';
ALTER TABLE ens402_approvals ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'hosted';
ALTER TABLE ens402_executions ADD COLUMN IF NOT EXISTS prepared jsonb;
CREATE INDEX IF NOT EXISTS ens402_approvals_owner ON ens402_approvals(owner_id,created_at);
CREATE TABLE IF NOT EXISTS ens402_agent_keys (
 id uuid PRIMARY KEY, owner_id text NOT NULL, approval_id uuid NOT NULL REFERENCES ens402_approvals(id),
 label text NOT NULL, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ens402_rate_limits (
 subject text NOT NULL, bucket bigint NOT NULL, hits integer NOT NULL, PRIMARY KEY(subject,bucket)
);`;
export type StoredApproval = { owner_id: string; mode: 'hosted' | 'self'; id: string; fingerprint: string; service: ResolvedService; approval: Approval; daily_limit: string; state: string; wallet_id: string | null; payer: string | null; policy_id: string | null; created_at: Date };
export type Execution = { prepared?: unknown; id: string; approval_id: string; state: string; authorization: PublicAuthorization | null; requirement: PaymentRequirements | null; receipt: PaymentReceipt | null; reserved_amount: string; created_at: Date };
export class Store {
  readonly pool: Pool;
  constructor(url: string) { this.pool = new Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000 }); }
  async migrate() { await this.pool.query(schema); }
  async close() { await this.pool.end(); }
  async health() { await this.pool.query('SELECT 1 FROM ens402_approvals LIMIT 1'); }
  private async transaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const value = await action(client); await client.query('COMMIT'); return value; }
    catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  async createApproval(input: { id: string; fingerprint: string; service: ResolvedService; approval: Approval; dailyLimit: string; ownerId?: string; mode?: 'hosted' | 'self'; payer?: string }) {
    await this.transaction(async client => {
      const owner = input.ownerId ?? 'operator';
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [owner]);
      const count = await client.query("SELECT count(*)::int AS n FROM ens402_approvals WHERE owner_id=$1 AND created_at > now()-interval '1 day'",[owner]);
      const existing = await client.query('SELECT id FROM ens402_approvals WHERE id=$1',[input.id]);
      if (!existing.rowCount && count.rows[0].n >= 20) throw new Error('Daily approval creation limit reached');
      await client.query(`INSERT INTO ens402_approvals(id,fingerprint,service,approval,daily_limit,state,owner_id,mode,payer) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`, [input.id,input.fingerprint,input.service,input.approval,input.dailyLimit,input.mode === 'self' ? 'active' : 'provisioning',owner,input.mode ?? 'hosted',input.payer ?? null]);
    });
    const stored = await this.getApproval(input.id);
    if (stored.owner_id !== (input.ownerId ?? 'operator') || stored.fingerprint !== input.fingerprint) throw new Error('Idempotency key was already used for different approval terms');
    return stored;
  }
  async getApproval(id: string): Promise<StoredApproval> {
    const result = await this.pool.query('SELECT * FROM ens402_approvals WHERE id=$1', [id]);
    if (!result.rows[0]) throw new Error('Approval not found'); return result.rows[0];
  }
  async activate(id: string, walletId: string, payer: string, policyId: string) {
    const result = await this.pool.query(`UPDATE ens402_approvals SET state='active',wallet_id=$2,payer=$3,policy_id=$4 WHERE id=$1 AND state='provisioning' RETURNING id`, [id,walletId,payer,policyId]);
    if (!result.rowCount && (await this.getApproval(id)).state !== 'active') throw new Error('Approval is no longer provisionable');
    return this.getApproval(id);
  }
  async revoke(id: string) { await this.pool.query("UPDATE ens402_approvals SET state='revoked' WHERE id=$1", [id]); }
  async listApprovals() { return (await this.pool.query('SELECT * FROM ens402_approvals ORDER BY created_at DESC LIMIT 50')).rows as StoredApproval[]; }
  async reserve(id: string, approvalId: string, now: number): Promise<{ created: boolean; execution: Execution }> {
    return this.transaction(async client => {
      const locked = await client.query('SELECT * FROM ens402_approvals WHERE id=$1 FOR UPDATE', [approvalId]);
      const row: StoredApproval | undefined = locked.rows[0]; if (!row) throw new Error('Approval not found');
      const existing = await client.query('SELECT * FROM ens402_executions WHERE id=$1', [id]);
      if (existing.rows[0]) {
        if (existing.rows[0].approval_id !== approvalId) throw new Error('Execution key belongs to another approval');
        return { created: false, execution: existing.rows[0] };
      }
      if (row.state !== 'active' || row.approval.expiresAt <= now) throw new Error('Approval is inactive or expired');
      const day = new Date(now * 1000).toISOString().slice(0,10);
      const spent = await client.query(`SELECT COALESCE(SUM(reserved_amount),0)::text AS amount FROM ens402_executions WHERE approval_id=$1 AND day=$2 AND state NOT IN ('held','rejected')`, [approvalId,day]);
      if (BigInt(spent.rows[0].amount) + BigInt(row.approval.maxAmount) > BigInt(row.daily_limit)) throw new Error('Daily budget is fully spent or reserved');
      const result = await client.query(`INSERT INTO ens402_executions(id,approval_id,day,reserved_amount,state) VALUES($1,$2,$3,$4,'reserved') RETURNING *`, [id,approvalId,day,row.approval.maxAmount]);
      return { created: true, execution: result.rows[0] };
    });
  }
  async beforeSubmit(id: string, authorization: PublicAuthorization, requirement: PaymentRequirements) {
    await this.transaction(async client => {
      const found = await client.query('SELECT approval_id FROM ens402_executions WHERE id=$1', [id]);
      if (!found.rows[0]) throw new Error('Execution not found');
      const approval = await client.query('SELECT state,approval FROM ens402_approvals WHERE id=$1 FOR UPDATE', [found.rows[0].approval_id]);
      if (approval.rows[0]?.state !== 'active' || approval.rows[0].approval.expiresAt <= Math.floor(Date.now()/1000)) throw new Error('Approval revoked or expired before submission');
      const result = await client.query(`UPDATE ens402_executions SET state='submitting',"authorization"=$2,requirement=$3,reserved_amount=$4,updated_at=now() WHERE id=$1 AND state='reserved' AND reserved_amount >= $4 RETURNING id`, [id,authorization,requirement,requirement.amount]);
      if (!result.rowCount) throw new Error('Execution cannot submit again');
    });
  }
  async finish(id: string, receipt: PaymentReceipt) {
    // Post-submission uncertainty must retain its budget reservation.
    const result = await this.pool.query(`UPDATE ens402_executions SET state=$2,receipt=$3,updated_at=now() WHERE id=$1 AND ((state='reserved' AND $2 IN ('held','rejected')) OR (state IN ('submitting','uncertain') AND $2 IN ('uncertain','settled','paid_delivery_failed'))) RETURNING *`, [id,receipt.state,receipt]);
    if (!result.rows[0]) throw new Error('Execution is already final or transition is unsafe'); return result.rows[0] as Execution;
  }
  async cancelReserved(id: string) {
    const receipt: PaymentReceipt = { state: 'held', reason: 'Buyer cancelled before submission', steps: [{ stage: 'cancel', detail: 'Reservation closed; a concurrent worker cannot submit it' }] };
    const result = await this.pool.query(`UPDATE ens402_executions SET state='held',receipt=$2,updated_at=now() WHERE id=$1 AND state='reserved' RETURNING *`,[id,receipt]);
    if (!result.rows[0]) throw new Error('Attempt may already be submitted; reconcile instead');
    return result.rows[0] as Execution;
  }
  async getExecution(id: string): Promise<Execution> {
    const result = await this.pool.query('SELECT * FROM ens402_executions WHERE id=$1',[id]);
    if (!result.rows[0]) throw new Error('Execution not found'); return result.rows[0];
  }
  async listExecutions() { return (await this.pool.query('SELECT * FROM ens402_executions ORDER BY created_at DESC LIMIT 50')).rows as Execution[]; }
  async assertOwner(owner: string, approvalId: string) {
    const row = await this.getApproval(approvalId);
    if (row.owner_id !== owner) throw new Error('Approval not found');
    return row;
  }
  async userState(owner: string) {
    const [approvals, executions, keys] = await Promise.all([
      this.pool.query('SELECT * FROM ens402_approvals WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50',[owner]),
      this.pool.query('SELECT e.* FROM ens402_executions e JOIN ens402_approvals a ON a.id=e.approval_id WHERE a.owner_id=$1 ORDER BY e.created_at DESC LIMIT 50',[owner]),
      this.pool.query('SELECT id,approval_id,label,expires_at,revoked_at FROM ens402_agent_keys WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50',[owner]),
    ]);
    return { approvals: approvals.rows as StoredApproval[], executions: executions.rows as Execution[], keys: keys.rows };
  }
  async createAgentKey(owner: string, approvalId: string, label: string) {
    const row = await this.assertOwner(owner,approvalId);
    if (row.state !== 'active' || row.approval.expiresAt <= Date.now()/1000) throw new Error('Approval must be active');
    const token = 'ens402_' + randomBytes(32).toString('base64url');
    const id = randomUUID();
    await this.pool.query('INSERT INTO ens402_agent_keys(id,owner_id,approval_id,label,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,to_timestamp($6))', [id,owner,approvalId,label,createHash('sha256').update(token).digest('hex'),row.approval.expiresAt]);
    return { id, token, approvalId, expiresAt: row.approval.expiresAt };
  }
  async authenticateAgent(token: string): Promise<{ owner_id: string; approval_id: string; id: string } | null> {
    const result = await this.pool.query(`SELECT k.id,k.owner_id,k.approval_id FROM ens402_agent_keys k JOIN ens402_approvals a ON a.id=k.approval_id WHERE k.token_hash=$1 AND k.revoked_at IS NULL AND k.expires_at>now() AND a.state='active' AND (a.approval->>'expiresAt')::bigint>extract(epoch from now())`,[createHash('sha256').update(token).digest('hex')]);
    return result.rows[0] ?? null;
  }
  async revokeAgentKey(owner: string, id: string) {
    const result = await this.pool.query('UPDATE ens402_agent_keys SET revoked_at=now() WHERE id=$1 AND owner_id=$2 RETURNING id',[id,owner]);
    if (!result.rowCount) throw new Error('Key not found');
    return { revoked: true };
  }
  async rateLimit(subject: string, limit=60) {
    const bucket = Math.floor(Date.now()/60000);
    const r = await this.pool.query('INSERT INTO ens402_rate_limits(subject,bucket,hits) VALUES($1,$2,1) ON CONFLICT(subject,bucket) DO UPDATE SET hits=ens402_rate_limits.hits+1 RETURNING hits',[subject,bucket]);
    if (r.rows[0].hits > limit) throw new Error('Request rate limit reached');
    await this.pool.query('DELETE FROM ens402_rate_limits WHERE subject=$1 AND bucket<$2',[subject,bucket-2]);
  }
  async savePrepared(id: string, prepared: unknown) {
    const r = await this.pool.query("UPDATE ens402_executions SET prepared=$2 WHERE id=$1 AND state='reserved' AND prepared IS NULL RETURNING id",[id,prepared]);
    if (!r.rowCount) throw new Error('Cannot prepare this attempt');
  }
  async merchantResponse(key: string) { return (await this.pool.query('SELECT state,response FROM ens402_merchant_payments WHERE nonce_key=$1',[key])).rows[0] ?? null; }
  async claimMerchant(key: string) {
    const result = await this.pool.query(`INSERT INTO ens402_merchant_payments(nonce_key,state) VALUES($1,'processing') ON CONFLICT DO NOTHING RETURNING nonce_key`, [key]);
    if (result.rowCount) return { claimed: true, response: null };
    const existing = await this.pool.query('SELECT response FROM ens402_merchant_payments WHERE nonce_key=$1',[key]);
    return { claimed: false, response: existing.rows[0]?.response ?? null };
  }
  async finishMerchant(key: string, response: unknown) { await this.pool.query(`UPDATE ens402_merchant_payments SET state='finished',response=$2,updated_at=now() WHERE nonce_key=$1 AND state='processing'`,[key,response]); }
}
