import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader, HTTPFacilitatorClient } from '@x402/core/http';
import { verifyTypedData, type Address, type Hex } from 'viem';
import { authorizationTypes } from '@x402/evm';
import { NETWORK, USDC, sameAddress } from '@ens402/sdk';
import type { PublicAuthorization } from '@ens402/sdk/http';
import { getStore } from './index';
import { amount, requireEnv } from './config';

/** A small, real x402 v2 testnet merchant. Resource data is explicitly demo data. */
export async function serveMerchant(request: Request, version: 'v1' | 'v2' = 'v1'): Promise<Response> {
  const configuredUrl = requireEnv('MERCHANT_RESOURCE_URL');
  const url = version === 'v2' ? new URL('/api/merchant/search-v2', configuredUrl).href : configuredUrl;
  const payTo = requireEnv('MERCHANT_PAY_TO');
  if (!sameAddress(payTo,payTo) || new URL(url).protocol !== 'https:') throw new Error('Merchant configuration is invalid');
  const requirement = { scheme: 'exact', network: NETWORK, asset: USDC, payTo, amount: amount(process.env.MERCHANT_PRICE_UNITS || '10000','1000000'), maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' } };
  const challenge = { x402Version: 2, resource: { url, description: 'ENS402 demonstration search result', mimeType: 'application/json' }, accepts: [requirement] };
  const unpaid = () => Response.json({ error: 'Payment required', ...challenge }, { status: 402, headers: { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(challenge), 'Cache-Control': 'no-store' } });
  const signatureHeader = request.headers.get('payment-signature');
  if (!signatureHeader) return unpaid();
  if (signatureHeader.length > 32768) return Response.json({ error: 'Payment header too large' }, { status: 400 });
  let payload;
  try { payload = decodePaymentSignatureHeader(signatureHeader); } catch { return unpaid(); }
  const r = payload.accepted;
  const a = payload.payload?.authorization as PublicAuthorization;
  const now = Math.floor(Date.now()/1000);
  if (payload.x402Version !== 2 || payload.resource?.url !== url || !r || r.scheme !== 'exact' || r.network !== NETWORK || !sameAddress(r.asset,USDC) || !sameAddress(r.payTo,payTo) || r.amount !== requirement.amount || r.extra?.name !== 'USDC' || r.extra?.version !== '2' || !a || !sameAddress(a.to,payTo) || a.value !== requirement.amount || a.validAfter !== '0' || !/^\d+$/.test(a.validBefore) || Number(a.validBefore) <= now || Number(a.validBefore) > now+300 || !/^0x[0-9a-fA-F]{64}$/.test(a.nonce)) return unpaid();
  try {
    if (!await verifyTypedData({ address: a.from as Address, domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC }, types: authorizationTypes, primaryType: 'TransferWithAuthorization', message: { from:a.from as Address,to:a.to as Address,value:BigInt(a.value),validAfter:0n,validBefore:BigInt(a.validBefore),nonce:a.nonce as Hex }, signature:payload.payload.signature as Hex })) return unpaid();
  } catch { return unpaid(); }
  const store = getStore();
  const key = `${NETWORK}:${USDC}:${a.from.toLowerCase()}:${a.nonce.toLowerCase()}`;
  const existing = await store.merchantResponse(key);
  if (existing?.response) return Response.json(existing.response.body, { status: existing.response.status, headers: existing.response.headers });
  if (existing) return Response.json({ error: 'Original payment needs reconciliation; do not pay twice.' }, { status: 409 });
  const facilitatorUrl = process.env.FACILITATOR_URL || 'https://x402.org/facilitator';
  if (new URL(facilitatorUrl).protocol !== 'https:') throw new Error('Facilitator requires HTTPS');
  const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });
  const verification = await facilitator.verify(payload, requirement);
  if (!verification.isValid || !sameAddress(verification.payer ?? '',a.from)) return unpaid();
  const claim = await store.claimMerchant(key);
  if (!claim.claimed) {
    if (claim.response) return Response.json(claim.response.body, { status: claim.response.status, headers: claim.response.headers });
    return Response.json({ error: 'Payment is already being processed or needs reconciliation. Do not issue a second payment.' }, { status: 409 });
  }
  // After a settlement attempt starts, a failure never deletes the nonce claim.
  const settlement = await facilitator.settle(payload, requirement);
  const headers = { 'PAYMENT-RESPONSE': encodePaymentResponseHeader(settlement), 'Cache-Control': 'no-store' };
  const status = settlement.success ? 200 : 402;
  const body = settlement.success ? { demo: true, result: 'A paid ENS402 sample search result', service: 'ENS402 test merchant', paidBy: a.from, transaction: settlement.transaction } : { error: 'Settlement failed', transaction: settlement.transaction };
  await store.finishMerchant(key, { status, body, headers });
  return Response.json(body, { status, headers });
}
