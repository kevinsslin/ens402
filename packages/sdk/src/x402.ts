import { x402Client } from '@x402/core/client';
import { ExactEvmScheme } from '@x402/evm/exact/client';
import type { ClientEvmSigner } from '@x402/evm';
import { wrapFetchWithPayment } from '@x402/fetch';
import { isAddress } from 'viem';
import type { ServiceAuthority } from './ens.js';
import { canonicalResourceUrl, resolveServiceAuthority } from './ens.js';
import {
  BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC_EIP712_NAME,
  BASE_SEPOLIA_USDC_EIP712_VERSION, MAX_PAYMENT_TIMEOUT_SECONDS,
} from './constants.js';
import { verifyPayment } from './payment.js';
import { paymentIntentMessage, type SignedPaymentIntent } from './auth.js';

type EnsClient = Parameters<typeof resolveServiceAuthority>[0];

export interface PolicyAuthorization {
  allowed: boolean;
  reason?: string;
  reservationId?: string;
  approvalUrl?: string;
  receiptUrl?: string;
}

export interface PolicyGateway {
  authorize(input: {
    intent: SignedPaymentIntent;
    signature: `0x${string}`;
  }): Promise<PolicyAuthorization>;
  settle(input: { reservationId: string; transaction?: string; outcome: 'settled' | 'uncertain'; intent: SignedPaymentIntent; signature: `0x${string}` }): Promise<void>;
}

export interface ProtectedPaymentOptions {
  serviceName: string;
  resourceUrl: string;
  ensClient: EnsClient;
  signer: ClientEvmSigner & { signMessage(input: { message: string }): Promise<`0x${string}`> };
  policyOrigin: string;
  policy: PolicyGateway;
  expectedAmountAtomic?: bigint;
  candidateSource?: 'configured' | 'bazaar';
  onDecisionReceipt?: (receiptUrl: string) => void;
  onApprovalRequired?: (approvalUrl: string) => Promise<void>;
  fetch?: typeof fetch;
  headers?: HeadersInit;
}

/** Each call uses a fresh x402 client so hooks cannot leak state across concurrent payments. */
export async function payForService(options: ProtectedPaymentOptions): Promise<Response> {
  const resourceUrl = canonicalResourceUrl(options.resourceUrl);
  let reservationId: string | undefined;
  let signedIntent: SignedPaymentIntent | undefined;
  let intentSignature: `0x${string}` | undefined;
  const client = new x402Client();
  client.register(BASE_SEPOLIA_NETWORK, new ExactEvmScheme(options.signer));
  client.onBeforePaymentCreation(async ({ paymentRequired, selectedRequirements }) => {
    try {
      if (canonicalResourceUrl(paymentRequired.resource.url) !== resourceUrl) {
        throw new Error('402 resource URL does not match the selected service');
      }
      const authority = await resolveServiceAuthority(options.ensClient, options.serviceName);
      const verified = verifyPayment({
        serviceName: authority.name,
        resourceUrl,
        payer: options.signer.address,
        requirement: selectedRequirements,
      }, authority);
      if (selectedRequirements.extra?.assetTransferMethod !== undefined &&
          selectedRequirements.extra.assetTransferMethod !== 'eip3009') {
        throw new Error('Only EIP-3009 payment authorization is supported');
      }
      if (selectedRequirements.extra?.name !== BASE_SEPOLIA_USDC_EIP712_NAME ||
          selectedRequirements.extra?.version !== BASE_SEPOLIA_USDC_EIP712_VERSION) {
        throw new Error('402 USDC signing domain does not match Base Sepolia USDC');
      }
      if (!Number.isInteger(selectedRequirements.maxTimeoutSeconds) ||
          selectedRequirements.maxTimeoutSeconds < 1 ||
          selectedRequirements.maxTimeoutSeconds > MAX_PAYMENT_TIMEOUT_SECONDS) {
        throw new Error('402 payment authorization timeout is unsupported');
      }
      if (options.expectedAmountAtomic !== undefined && verified.amountAtomic !== options.expectedAmountAtomic) {
        throw new Error('402 amount differs from the selected Bazaar price');
      }
      const intent: SignedPaymentIntent = {
        attemptId: crypto.randomUUID(), payer: options.signer.address,
        serviceName: authority.name, resourceUrl, payTo: authority.payTo,
        amountAtomic: verified.amountAtomic.toString(), issuedAt: Date.now(),
        policyOrigin: new URL(options.policyOrigin).origin,
        candidateSource: options.candidateSource ?? 'configured',
        ...(options.expectedAmountAtomic === undefined ? {} : { catalogAmountAtomic: options.expectedAmountAtomic.toString() }),
      };
      const signature = await options.signer.signMessage({ message: paymentIntentMessage(intent) });
      signedIntent = intent;
      intentSignature = signature;
      let decision = await options.policy.authorize({ intent, signature });
      if (decision.receiptUrl) options.onDecisionReceipt?.(decision.receiptUrl);
      if (!decision.allowed && decision.approvalUrl && options.onApprovalRequired) {
        const approvalUrl = new URL(decision.approvalUrl);
        const expectedOrigin = new URL(options.policyOrigin).origin;
        if (approvalUrl.origin === expectedOrigin && /^\/approve\/[0-9a-f-]{36}$/i.test(approvalUrl.pathname)) {
          await options.onApprovalRequired(approvalUrl.href);
          decision = await options.policy.authorize({ intent, signature });
        }
      }
      if (!decision.allowed || !decision.reservationId) {
        return { abort: true, reason: [decision.reason ?? 'Payment requires approval', decision.approvalUrl, decision.receiptUrl].filter(Boolean).join(' ')};
      }
      reservationId = decision.reservationId;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Verification failed';
      let receiptUrl: string | undefined;
      if (!signedIntent && isAddress(selectedRequirements.payTo) && /^[1-9][0-9]*$/.test(selectedRequirements.amount)) {
        try {
          const refusalIntent: SignedPaymentIntent = {
            attemptId: crypto.randomUUID(), payer: options.signer.address,
            serviceName: options.serviceName, resourceUrl, payTo: selectedRequirements.payTo,
            amountAtomic: selectedRequirements.amount, issuedAt: Date.now(),
            policyOrigin: new URL(options.policyOrigin).origin,
            candidateSource: options.candidateSource ?? 'configured',
            ...(options.expectedAmountAtomic === undefined ? {} : { catalogAmountAtomic: options.expectedAmountAtomic.toString() }),
            purpose: 'preflight_refusal', preflightReason: reason.slice(0, 200),
            observedResourceUrl: paymentRequired.resource.url.slice(0, 2048),
          };
          const signature = await options.signer.signMessage({ message: paymentIntentMessage(refusalIntent) });
          const report = await options.policy.authorize({ intent: refusalIntent, signature });
          receiptUrl = report.receiptUrl;
          if (receiptUrl) options.onDecisionReceipt?.(receiptUrl);
        } catch { /* A receipt is optional; a failed report never permits payment. */ }
      }
      return { abort: true, reason: [reason, receiptUrl].filter(Boolean).join(' ') };
    }
  });
  client.onPaymentCreationFailure(async () => {
    if (reservationId && signedIntent && intentSignature) await options.policy.settle({ reservationId, outcome: 'uncertain', intent: signedIntent, signature: intentSignature });
  });
  client.onPaymentResponse(async ({ settleResponse }) => {
    if (!reservationId || !signedIntent || !intentSignature) return;
    await options.policy.settle({
      reservationId,
      transaction: settleResponse?.success ? settleResponse.transaction : undefined,
      outcome: settleResponse?.success ? 'settled' : 'uncertain',
      intent: signedIntent, signature: intentSignature,
    });
  });
  const paidFetch = wrapFetchWithPayment(options.fetch ?? fetch, client);
  return paidFetch(resourceUrl, { method: 'GET', redirect: 'error', headers: options.headers });
}
