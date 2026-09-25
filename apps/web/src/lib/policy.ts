import { createHash, randomUUID } from 'node:crypto';
import { getAddress, isAddress, parseAbiItem, verifyMessage } from 'viem';
import { createPublicClient, decodeEventLog, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import { z } from 'zod';
import {
  BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC, createEnsClient,
  paymentIntentMessage, resolveServiceAuthority, verifyPayment,
  type SignedPaymentIntent,
} from '@hufu402/sdk';
import { database, transaction } from './db';
import { getRisk } from './risk';

const address = z.string().refine(isAddress);
const intentSchema = z.object({
  attemptId: z.uuid(), payer: address, serviceName: z.string().min(1),
  resourceUrl: z.url(), payTo: address,
  amountAtomic: z.string().regex(/^[1-9][0-9]*$/),
  issuedAt: z.number().int(), policyOrigin: z.url(),
});
export const authorizeSchema = z.object({ intent: intentSchema, signature: z.string().regex(/^0x[0-9a-fA-F]+$/) });
export const settleSchema = authorizeSchema.extend({
  reservationId: z.uuid(), outcome: z.enum(['settled', 'uncertain']),
  transaction: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});

function configuredAtomic(name: string): bigint {
  const value = process.env[name];
  if (!value || !/^[1-9][0-9]*$/.test(value)) throw new Error(`${name} must be configured as a positive atomic amount`);
  return BigInt(value);
}
function policyOrigin(): string {
  const origin = process.env.POLICY_ORIGIN;
  if (!origin) throw new Error('POLICY_ORIGIN is required');
  return new URL(origin).origin;
}
async function validateSignature(intent: SignedPaymentIntent, signature: `0x${string}`, maxAgeMs = 10 * 60 * 1000): Promise<void> {
  if (intent.policyOrigin !== policyOrigin()) throw new Error('Policy origin mismatch');
  if (Math.abs(Date.now() - intent.issuedAt) > maxAgeMs) throw new Error('Payment intent expired');
  const valid = await verifyMessage({ address: getAddress(intent.payer), message: paymentIntentMessage(intent), signature });
  if (!valid) throw new Error('Invalid payer signature');
}

export interface AuthorizationResult { allowed: boolean; reason?: string; reservationId?: string; approvalUrl?: string; risk?: string }

export async function authorizePayment(raw: unknown): Promise<AuthorizationResult> {
  const { intent, signature } = authorizeSchema.parse(raw);
  await validateSignature(intent, signature as `0x${string}`);
  const intentHash = createHash('sha256').update(paymentIntentMessage(intent)).digest('hex');
  const ensRpc = process.env.SEPOLIA_RPC_URL;
  if (!ensRpc) throw new Error('SEPOLIA_RPC_URL is required');
  const authority = await resolveServiceAuthority(createEnsClient(ensRpc), intent.serviceName);
  const verified = verifyPayment({
    serviceName: authority.name, resourceUrl: intent.resourceUrl, payer: getAddress(intent.payer),
    requirement: { scheme: 'exact', network: BASE_SEPOLIA_NETWORK,
      asset: BASE_SEPOLIA_USDC, amount: intent.amountAtomic, payTo: intent.payTo },
  }, authority);
  const perPaymentCap = configuredAtomic('HUFU_PER_PAYMENT_CAP_ATOMIC');
  const dailyCap = configuredAtomic('HUFU_DAILY_CAP_ATOMIC');
  const largeThreshold = configuredAtomic('HUFU_LARGE_PAYEE_ATOMIC');
  if (verified.amountAtomic > perPaymentCap) return { allowed: false, reason: 'Per-payment cap exceeded' };
  if (verified.amountAtomic > dailyCap) return { allowed: false, reason: 'Daily cap exceeded' };
  const risk = await getRisk(authority.payTo);
  if (risk.tier === 'high') return { allowed: false, reason: `High risk payee: ${risk.reasons.join(', ')}`, risk: risk.tier };
  return transaction(async db => {
    const wallet = intent.payer.toLowerCase();
    const agent = await db.query<{ owner_id: string }>('SELECT owner_id FROM agents WHERE wallet=$1', [wallet]);
    const ownerId = agent.rows[0]?.owner_id;
    if (!ownerId) return { allowed: false, reason: 'Agent enrollment required', approvalUrl: `${policyOrigin()}/enroll?wallet=${wallet}` };
    await db.query('SELECT id FROM owners WHERE id=$1 FOR UPDATE', [ownerId]);
    const existingReservation = await db.query<{
      id: string; owner_id: string; intent_hash: string | null; status: string;
    }>('SELECT id,owner_id,intent_hash,status FROM reservations WHERE attempt_id=$1', [intent.attemptId]);
    if (existingReservation.rows[0]) {
      const row = existingReservation.rows[0];
      if (row.owner_id !== ownerId || row.intent_hash !== intentHash) return { allowed: false, reason: 'Attempt ID was reused for a different payment' };
      // A second successful response could authorize another EIP-3009 nonce
      // against the same daily-spend reservation.
      return { allowed: false, reason: `Payment attempt is already ${row.status}`, risk: risk.tier };
    }
    const existingApproval = await db.query<{
      id: string; owner_id: string; intent_hash: string | null; status: string; expires_at: Date;
    }>('SELECT id,owner_id,intent_hash,status,expires_at FROM approvals WHERE attempt_id=$1', [intent.attemptId]);
    const priorApproval = existingApproval.rows[0];
    if (priorApproval && (priorApproval.owner_id !== ownerId || priorApproval.intent_hash !== intentHash)) {
      return { allowed: false, reason: 'Attempt ID was reused for a different payment' };
    }
    if (priorApproval?.status === 'denied' || priorApproval?.status === 'expired') {
      return { allowed: false, reason: `Payment approval was ${priorApproval.status}`, risk: risk.tier };
    }
    if (priorApproval?.status === 'pending') {
      return priorApproval.expires_at.getTime() > Date.now()
        ? { allowed: false, reason: 'Payment approval is pending', approvalUrl: `${policyOrigin()}/approve/${priorApproval.id}`, risk: risk.tier }
        : { allowed: false, reason: 'Payment approval expired', risk: risk.tier };
    }
    const previous = await db.query<{ pay_to: string; changed_at: Date }>('SELECT pay_to, changed_at FROM payee_observations WHERE service_name=$1 FOR UPDATE', [authority.name]);
    let changedAt = previous.rows[0]?.changed_at;
    if (!previous.rows[0]) {
      await db.query('INSERT INTO payee_observations (service_name,pay_to,changed_at,observed_at) VALUES ($1,$2,now(),now())', [authority.name, authority.payTo.toLowerCase()]);
      changedAt = new Date();
    } else if (previous.rows[0].pay_to !== authority.payTo.toLowerCase()) {
      await db.query('UPDATE payee_observations SET pay_to=$2, changed_at=now(), observed_at=now() WHERE service_name=$1', [authority.name, authority.payTo.toLowerCase()]);
      changedAt = new Date();
    } else {
      await db.query('UPDATE payee_observations SET observed_at=now() WHERE service_name=$1', [authority.name]);
    }
    const grant = await db.query<{ id: string; daily_cap_atomic: string; created_at: Date }>(
      `SELECT id,daily_cap_atomic,created_at FROM grants WHERE owner_id=$1 AND agent_wallet=$2 AND service_name=$3
       AND network=$4 AND pay_to=$5 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [ownerId, wallet, authority.name, BASE_SEPOLIA_NETWORK, authority.payTo.toLowerCase()],
    );
    const currentGrant = grant.rows[0];
    const rotatedSinceGrant = !!currentGrant && !!changedAt && changedAt.getTime() > currentGrant.created_at.getTime();
    if (priorApproval?.status === 'approved' && (!currentGrant || rotatedSinceGrant)) {
      return { allowed: false, reason: 'Approved payment grant is no longer valid', risk: risk.tier };
    }
    if (!currentGrant || (risk.tier === 'medium' && priorApproval?.status !== 'approved') || rotatedSinceGrant) {
      const approvalId = randomUUID();
      const requiresSecondPerson = !currentGrant && verified.amountAtomic >= largeThreshold;
      await db.query(
        `INSERT INTO approvals (id,owner_id,agent_wallet,service_name,resource_url,network,pay_to,amount_atomic,daily_cap_atomic,status,requires_second_person,expires_at,attempt_id,intent_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,now()+interval '5 minutes',$11,$12)`,
        [approvalId, ownerId, wallet, authority.name, intent.resourceUrl, BASE_SEPOLIA_NETWORK, authority.payTo.toLowerCase(),
          verified.amountAtomic.toString(), dailyCap.toString(), requiresSecondPerson, intent.attemptId, intentHash],
      );
      return { allowed: false, reason: risk.tier === 'medium' ? 'Medium risk requires approval' : 'New or rotated payee requires approval',
        approvalUrl: `${policyOrigin()}/approve/${approvalId}`, risk: risk.tier };
    }
    const effectiveDailyCap = BigInt(currentGrant.daily_cap_atomic) < dailyCap ? BigInt(currentGrant.daily_cap_atomic) : dailyCap;
    const spent = await db.query<{ total: string }>(
      `SELECT COALESCE(sum(amount_atomic),0)::text AS total FROM reservations
       WHERE owner_id=$1 AND spend_day=(now() AT TIME ZONE 'UTC')::date AND status IN ('reserved','settled','uncertain')`, [ownerId],
    );
    if (BigInt(spent.rows[0]?.total ?? '0') + verified.amountAtomic > effectiveDailyCap) {
      return { allowed: false, reason: 'Daily cap exceeded', risk: risk.tier };
    }
    const reservationId = randomUUID();
    await db.query(
      `INSERT INTO reservations (id,attempt_id,owner_id,agent_wallet,service_name,pay_to,amount_atomic,spend_day,status,expires_at,intent_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,(now() AT TIME ZONE 'UTC')::date,'reserved',now()+interval '30 minutes',$8)`,
      [reservationId, intent.attemptId, ownerId, wallet, authority.name, authority.payTo.toLowerCase(), verified.amountAtomic.toString(), intentHash],
    );
    return { allowed: true, reservationId, risk: risk.tier };
  });
}

const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
export async function verifySettlement(intent: Pick<SignedPaymentIntent, 'payer' | 'payTo' | 'amountAtomic'>, hash: `0x${string}`): Promise<boolean> {
  const rpc = process.env.BASE_SEPOLIA_RPC_URL;
  if (!rpc) throw new Error('BASE_SEPOLIA_RPC_URL is required');
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpc) });
  const receipt = await client.getTransactionReceipt({ hash });
  if (receipt.status !== 'success') return false;
  return receipt.logs.some(log => {
    if (getAddress(log.address) !== getAddress(BASE_SEPOLIA_USDC)) return false;
    try {
      const decoded = decodeEventLog({ abi: [transferEvent], data: log.data, topics: log.topics });
      return decoded.eventName === 'Transfer' &&
        getAddress(decoded.args.from) === getAddress(intent.payer) &&
        getAddress(decoded.args.to) === getAddress(intent.payTo) &&
        decoded.args.value >= BigInt(intent.amountAtomic);
    } catch { return false; }
  });
}

export async function recordSettlement(raw: unknown): Promise<{ status: 'settled' | 'uncertain' }> {
  const { intent, signature, reservationId, outcome, transaction: hash } = settleSchema.parse(raw);
  await validateSignature(intent, signature as `0x${string}`, 30 * 60 * 1000);
  const intentHash = createHash('sha256').update(paymentIntentMessage(intent)).digest('hex');
  const verified = outcome === 'settled' && hash ? await verifySettlement(intent, hash as `0x${string}`).catch(() => false) : false;
  const status = verified ? 'settled' : 'uncertain';
  const result = await database().query(
    `UPDATE reservations SET status=$1, transaction_hash=COALESCE($2,transaction_hash)
     WHERE id=$3 AND attempt_id=$4 AND agent_wallet=$5 AND pay_to=$6 AND amount_atomic=$7
       AND intent_hash=$8 AND status IN ('reserved','uncertain')
       AND (transaction_hash IS NULL OR transaction_hash=$2) RETURNING id`,
    [status, hash ?? null, reservationId, intent.attemptId, intent.payer.toLowerCase(), intent.payTo.toLowerCase(), intent.amountAtomic, intentHash],
  );
  if (!result.rowCount) {
    const existing = await database().query<{ status: string; transaction_hash: string | null }>(
      'SELECT status,transaction_hash FROM reservations WHERE id=$1 AND attempt_id=$2 AND intent_hash=$3',
      [reservationId, intent.attemptId, intentHash],
    );
    if (existing.rows[0]?.status === 'settled' && existing.rows[0].transaction_hash === hash) return { status: 'settled' };
    throw new Error('Reservation not found or already closed');
  }
  return { status };
}
