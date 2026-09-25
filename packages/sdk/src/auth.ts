export interface SignedPaymentIntent {
  attemptId: string;
  payer: `0x${string}`;
  serviceName: string;
  resourceUrl: string;
  payTo: `0x${string}`;
  amountAtomic: string;
  issuedAt: number;
  policyOrigin: string;
  candidateSource?: 'configured' | 'bazaar';
  catalogAmountAtomic?: string;
  purpose?: 'preflight_refusal';
  preflightReason?: string;
  observedResourceUrl?: string;
}

export function paymentIntentMessage(intent: SignedPaymentIntent): string {
  return [
    'HuFu payment authorization v1',
    `Policy origin: ${intent.policyOrigin}`,
    `Attempt: ${intent.attemptId}`,
    `Payer: ${intent.payer.toLowerCase()}`,
    `Service: ${intent.serviceName}`,
    `Resource: ${intent.resourceUrl}`,
    `Payee: ${intent.payTo.toLowerCase()}`,
    `USDC atomic amount: ${intent.amountAtomic}`,
    `Issued at: ${intent.issuedAt}`,
    ...(intent.candidateSource ? [`Candidate source: ${intent.candidateSource}`] : []),
    ...(intent.catalogAmountAtomic ? [`Catalog USDC atomic amount: ${intent.catalogAmountAtomic}`] : []),
    ...(intent.purpose ? [`Purpose: ${intent.purpose}`] : []),
    ...(intent.preflightReason ? [`SDK preflight reason: ${intent.preflightReason}`] : []),
    ...(intent.observedResourceUrl ? [`Observed 402 resource: ${intent.observedResourceUrl}`] : []),
  ].join('\n');
}
