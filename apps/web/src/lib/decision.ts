import { createHash } from 'node:crypto';
import { getAddress, verifyMessage } from 'viem';
import { PAYMENT_INTENT_MAX_AGE_MS, SETTLEMENT_REPORT_MAX_AGE_MS, paymentIntentMessage } from '@hufu402/sdk';
import { database } from './db';
import type { SignedPaymentIntent, ServiceAuthority } from '@hufu402/sdk';
import type { RiskResult } from './risk';

export type DecisionStatus = 'checking' | 'refused' | 'paused' | 'approval_required' | 'reserved';

export interface DecisionEvidence {
  authority?: ServiceAuthority;
  risk?: RiskResult;
  perPaymentCapAtomic?: bigint;
  dailyCapAtomic?: bigint;
  spentBeforeAtomic?: bigint;
  approvalId?: string;
  reservationId?: string;
}

export function decisionReceiptUrl(attemptId: string, policyOrigin: string): string {
  return new URL(`/decisions/${attemptId}`, policyOrigin).href;
}

export async function startDecisionReceipt(intent: SignedPaymentIntent, signature: string, intentHash: string): Promise<boolean> {
  await database().query(
    `INSERT INTO decision_receipts (attempt_id,intent_hash,signed_intent,intent_signature,status)
     VALUES ($1,$2,$3,$4,'checking') ON CONFLICT (attempt_id) DO NOTHING`,
    [intent.attemptId, intentHash, JSON.stringify(intent), signature],
  );
  const existing = await database().query<{ intent_hash: string }>(
    'SELECT intent_hash FROM decision_receipts WHERE attempt_id=$1', [intent.attemptId],
  );
  return existing.rows[0]?.intent_hash === intentHash;
}

export async function updateDecisionReceipt(
  attemptId: string, status: DecisionStatus, reason: string | null, evidence: DecisionEvidence = {},
): Promise<void> {
  const result = await database().query(
    `UPDATE decision_receipts SET status=$2, reason=$3,
       authority=COALESCE($4::jsonb,authority), risk=COALESCE($5::jsonb,risk),
       per_payment_cap_atomic=COALESCE($6,per_payment_cap_atomic),
       daily_cap_atomic=COALESCE($7,daily_cap_atomic),
       spent_before_atomic=COALESCE($8,spent_before_atomic),
       approval_id=COALESCE($9,approval_id), reservation_id=COALESCE($10,reservation_id),
       updated_at=now() WHERE attempt_id=$1`,
    [attemptId, status, reason, evidence.authority ? JSON.stringify(evidence.authority) : null,
      evidence.risk ? JSON.stringify(evidence.risk) : null,
      evidence.perPaymentCapAtomic?.toString() ?? null, evidence.dailyCapAtomic?.toString() ?? null,
      evidence.spentBeforeAtomic?.toString() ?? null, evidence.approvalId ?? null, evidence.reservationId ?? null],
  );
  if (!result.rowCount) throw new Error('Decision receipt was not found');
}

interface StoredDecisionReceipt {
  attempt_id: string;
  intent_hash: string;
  signed_intent: SignedPaymentIntent;
  intent_signature: string;
  status: DecisionStatus;
  reason: string | null;
  authority: ServiceAuthority | null;
  risk: RiskResult | null;
  per_payment_cap_atomic: string | null;
  daily_cap_atomic: string | null;
  spent_before_atomic: string | null;
  approval_id: string | null;
  reservation_id: string | null;
  created_at: Date;
  updated_at: Date;
  approval_status: string | null;
  approval_expires_at: Date | null;
  first_approved: boolean | null;
  reservation_status: string | null;
  transaction_hash: string | null;
}

export async function getDecisionReceipt(attemptId: string) {
  const result = await database().query<StoredDecisionReceipt>(
    `SELECT d.*,a.status AS approval_status,a.expires_at AS approval_expires_at,
       (a.first_subject IS NOT NULL) AS first_approved,
       r.status AS reservation_status,r.transaction_hash
     FROM decision_receipts d
     LEFT JOIN approvals a ON a.id=d.approval_id
     LEFT JOIN reservations r ON r.id=d.reservation_id
     WHERE d.attempt_id=$1`, [attemptId],
  );
  const row = result.rows[0];
  if (!row) return null;
  const message = paymentIntentMessage(row.signed_intent);
  const digest = createHash('sha256').update(message).digest('hex');
  let signatureVerified = false;
  if (digest === row.intent_hash) {
    try {
      signatureVerified = await verifyMessage({
        address: getAddress(row.signed_intent.payer), message,
        signature: row.intent_signature as `0x${string}`,
      });
    } catch { /* A malformed stored signature is reported as an invalid receipt. */ }
  }
  const signatureDisclosureAt = row.signed_intent.issuedAt + SETTLEMENT_REPORT_MAX_AGE_MS + 30_000;
  let status: string = row.status;
  if (row.reservation_status) status = row.reservation_status;
  else if (row.approval_status === 'approved') {
    status = Date.now() - row.signed_intent.issuedAt > PAYMENT_INTENT_MAX_AGE_MS
      ? 'approved_intent_expired' : 'approved_waiting_for_agent';
  }
  else if (row.approval_status === 'denied') status = 'refused';
  else if (row.approval_status === 'pending' && row.approval_expires_at && row.approval_expires_at.getTime() <= Date.now()) status = 'expired';
  if (!signatureVerified) status = 'invalid_receipt';
  return {
    attemptId: row.attempt_id, intentHash: row.intent_hash,
    signedIntent: row.signed_intent,
    intentSignature: Date.now() > signatureDisclosureAt ? row.intent_signature : null,
    signatureDisclosureAt: new Date(signatureDisclosureAt).toISOString(), signatureVerified,
    status, reason: row.reason, authority: row.authority, risk: row.risk,
    perPaymentCapAtomic: row.per_payment_cap_atomic,
    dailyCapAtomic: row.daily_cap_atomic, spentBeforeAtomic: row.spent_before_atomic,
    approvalId: row.approval_id, approvalStatus: row.approval_status,
    firstApproved: row.first_approved ?? false,
    reservationId: row.reservation_id, transactionHash: row.transaction_hash,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}
