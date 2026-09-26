import { decodePaymentRequiredHeader, decodePaymentResponseHeader, encodePaymentSignatureHeader } from '@x402/core/http';
import type { PaymentPayload, PaymentRequired, PaymentRequirements, SettleResponse } from '@x402/core/types';
import type { ClientEvmSigner } from '@x402/evm';
import { NETWORK, sameAddress, verifyRequest, type Approval, type ServiceSnapshot, type RiskEvidence } from './index';
import { preparePayment } from './x402';

export type ResourceTransport = (url: string, options: { method: 'GET'; headers: Record<string, string>; redirect: 'error'; signal: AbortSignal }) => Promise<Response>;
export type PublicAuthorization = { from: string; to: string; value: string; nonce: string; validAfter: string; validBefore: string };
export type PaymentReceipt = {
  state: 'rejected' | 'held' | 'settled' | 'paid_delivery_failed' | 'uncertain';
  reason: string; steps: { stage: string; detail: string }[];
  service?: ServiceSnapshot; requirement?: PaymentRequirements; evidence?: RiskEvidence;
  authorization?: PublicAuthorization; settlement?: SettleResponse; resource?: string;
};
export function parseChallenge(header: string | null, endpoint: string): PaymentRequired {
  if (!header || header.length > 32768) throw new Error('Missing or oversized PAYMENT-REQUIRED header');
  const challenge = decodePaymentRequiredHeader(header);
  if (challenge.x402Version !== 2 || challenge.resource?.url !== endpoint || !Array.isArray(challenge.accepts) || challenge.accepts.length < 1 || challenge.accepts.length > 20) throw new Error('Unsupported x402 challenge');
  for (const r of challenge.accepts) {
    if (!r || typeof r.scheme !== 'string' || typeof r.network !== 'string' || typeof r.asset !== 'string' || typeof r.payTo !== 'string' || typeof r.amount !== 'string' || typeof r.maxTimeoutSeconds !== 'number' || !r.extra || typeof r.extra !== 'object' || Array.isArray(r.extra)) throw new Error('Malformed x402 requirement');
  }
  return challenge;
}
async function limitedText(response: Response, limit = 65536): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  let bytes = 0; const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length; if (bytes > limit) throw new Error('Resource exceeds demo response limit');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const result = new Uint8Array(bytes); let at = 0;
  for (const chunk of chunks) { result.set(chunk, at); at += chunk.length; }
  return new TextDecoder().decode(result);
}
/** One purchase attempt. Never automatically re-sign or resend after submission uncertainty. */
export async function purchaseResource(options: {
  name: string; approval: Approval; resolve: (name: string) => Promise<ServiceSnapshot>;
  screen: (address: string) => Promise<RiskEvidence>; signer: ClientEvmSigner;
  transport: ResourceTransport;
  verifySettlement: (settlement: SettleResponse, authorization: PublicAuthorization, requirement: PaymentRequirements) => Promise<void>;
  /** Persist the unique nonce before any authorization leaves this process. Throw to prevent submission. */
  beforeSubmit: (authorization: PublicAuthorization, requirement: PaymentRequirements) => Promise<void>;
  now?: () => number;
}): Promise<PaymentReceipt> {
  const approval = structuredClone(options.approval);
  const clock = options.now ?? (() => Math.floor(Date.now() / 1000));
  const receipt: PaymentReceipt = { state: 'held', reason: 'No payment submitted', steps: [] };
  let transmitted = false;
  const step = (stage: string, detail: string) => receipt.steps.push({ stage, detail });
  try {
    const service = await options.resolve(options.name); receipt.service = service;
    if (service.name !== approval.name || service.authority !== approval.authority || !approval.endpoints.includes(service.endpoint) || service.status !== 'active' || approval.expiresAt <= clock()) throw new Error('Service requires approval before requesting its API');
    step('resolve', `Read ${service.name} at ENS block ${service.block}`);
    const response = await options.transport(service.endpoint, { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (response.status !== 402) { await response.body?.cancel(); throw new Error('Expected an HTTP 402 challenge'); }
    const challenge = parseChallenge(response.headers.get('payment-required'), service.endpoint);
    await response.body?.cancel();
    const selected = challenge.accepts.find(r => verifyRequest(service, service.endpoint, r, approval, clock()).outcome === 'continue');
    if (!selected) { receipt.state = 'rejected'; receipt.reason = 'No offered payment matches ENS and buyer approval'; step('verify', receipt.reason); return receipt; }
    const requirement = structuredClone(selected); receipt.requirement = requirement;
    step('verify', 'Actual HTTP 402 matches ENS recipient, token, network and buyer limits');
    const guardedSigner: ClientEvmSigner = {
      address: options.signer.address,
      async signTypedData(data) {
        const fresh = await options.resolve(options.name);
        if (fresh.authority !== service.authority || fresh.endpoint !== service.endpoint || verifyRequest(fresh, service.endpoint, requirement, approval, clock()).outcome !== 'continue') throw new Error('ENS configuration changed before signing');
        step('resolve-again', `Rechecked ENS immediately before signing at block ${fresh.block}`);
        return options.signer.signTypedData(data);
      },
    };
    const prepared = await preparePayment({ service, requestUrl: service.endpoint, requirement, approval, screen: options.screen, signer: guardedSigner, now: clock });
    receipt.evidence = prepared.evidence;
    if (!prepared.payload) { receipt.state = prepared.decision.outcome === 'reject' ? 'rejected' : 'held'; receipt.reason = prepared.decision.reason; step('decision', receipt.reason); return receipt; }
    step('screen', 'Usable Intercepta evidence passed the configured risk rules');
    const authorization = prepared.payload.payload.authorization as PublicAuthorization;
    if (!authorization || !sameAddress(authorization.from, options.signer.address) || !sameAddress(authorization.to, requirement.payTo) || authorization.value !== requirement.amount || !/^0x[0-9a-fA-F]{64}$/.test(authorization.nonce)) throw new Error('Invalid authorization payload');
    receipt.authorization = structuredClone(authorization);
    step('sign', 'Wallet signed the exact payment authorization');
    await options.beforeSubmit(receipt.authorization, requirement);
    transmitted = true;
    return submitResourcePayment({ endpoint: service.endpoint, payload: prepared.payload.payload, receipt, transport: options.transport, verifySettlement: options.verifySettlement });
  } catch {
    receipt.state = transmitted ? 'uncertain' : 'held';
    receipt.reason = transmitted ? 'Authorization was submitted; reconcile its nonce before any retry' : 'Required evidence or service response unavailable; payment not submitted';
    step('stop', receipt.reason);
    return receipt;
  }
}

/** Submit an already verified authorization once. Callers must persist its nonce first. */
export async function submitResourcePayment(options: {
  endpoint: string; payload: PaymentPayload['payload']; receipt: PaymentReceipt;
  transport: ResourceTransport;
  verifySettlement: (settlement: SettleResponse, authorization: PublicAuthorization, requirement: PaymentRequirements) => Promise<void>;
}): Promise<PaymentReceipt> {
  const receipt = structuredClone(options.receipt);
  const requirement = receipt.requirement!;
  const authorization = receipt.authorization!;
  const step = (stage: string, detail: string) => receipt.steps.push({ stage, detail });
  let transmitted = false;
  try {
    const fullPayload: PaymentPayload = { x402Version: 2, accepted: requirement, resource: { url: options.endpoint }, payload: options.payload };
    transmitted = true;
    step('submit', 'Sent the authorization once; automatic retries are disabled');
    const paid = await options.transport(options.endpoint, { method: 'GET', headers: { Accept: 'application/json', 'PAYMENT-SIGNATURE': encodePaymentSignatureHeader(fullPayload) }, redirect: 'error', signal: AbortSignal.timeout(45000) });
    const header = paid.headers.get('payment-response');
    if (!header || header.length > 32768) { await paid.body?.cancel(); throw new Error('Missing settlement receipt'); }
    const settlement = decodePaymentResponseHeader(header);
    if (!settlement.success || settlement.network !== NETWORK || !/^0x[0-9a-fA-F]{64}$/.test(settlement.transaction) || !sameAddress(settlement.payer ?? '', authorization.from)) { await paid.body?.cancel(); throw new Error('Invalid settlement receipt'); }
    receipt.settlement = settlement;
    try { await options.verifySettlement(settlement, authorization, requirement); }
    catch (error) { await paid.body?.cancel(); throw error; }
    step('settle', 'Base Sepolia receipt confirms this authorization nonce and USDC transfer');
    receipt.state = paid.ok ? 'settled' : 'paid_delivery_failed';
    receipt.reason = paid.ok ? 'Payment confirmed and resource delivered' : 'Payment confirmed, but the service returned an error';
    try { receipt.resource = await limitedText(paid); }
    catch { receipt.state = 'paid_delivery_failed'; receipt.reason = 'Payment confirmed, but resource delivery could not be completed'; }
    return receipt;
  } catch {
    receipt.state = transmitted ? 'uncertain' : 'held';
    receipt.reason = transmitted ? 'Submission outcome is uncertain; reconcile before retrying' : 'No payment submitted';
    return receipt;
  }
}
