import { describe, expect, it, vi } from 'vitest';
import { payForService, type PolicyGateway } from '../src/x402.js';
import { ENS_V2_PERMISSIONED_RESOLVER_IMPL } from '../src/constants.js';
import { createEnsClient } from '../src/ens.js';
import { privateKeyToAccount } from 'viem/accounts';

const url = 'https://merchant.example/search';
const payee = '0x1111111111111111111111111111111111111111';
const attacker = '0x5555555555555555555555555555555555555555';
function serviceClient() {
  return {
    getEnsText: vi.fn().mockResolvedValue(url),
    getEnsAddress: vi.fn().mockResolvedValue(payee),
    getEnsResolver: vi.fn().mockResolvedValue('0x2222222222222222222222222222222222222222'),
    readContract: vi.fn().mockResolvedValue(ENS_V2_PERMISSIONED_RESOLVER_IMPL),
  } as unknown as ReturnType<typeof createEnsClient>;
}
function requiredResponse(payTo: string, payment?: { maxTimeoutSeconds?: number; extra?: Record<string, unknown> }) {
  const body = {
    x402Version: 2,
    resource: { url, description: 'Search', mimeType: 'application/json' },
    accepts: [{ scheme: 'exact', network: 'eip155:84532',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', amount: '1000',
      payTo, maxTimeoutSeconds: payment?.maxTimeoutSeconds ?? 60,
      extra: payment?.extra ?? { name: 'USDC', version: '2' } }],
  };
  return new Response(JSON.stringify(body), { status: 402,
    headers: { 'PAYMENT-REQUIRED': Buffer.from(JSON.stringify(body)).toString('base64'), 'content-type': 'application/json' } });
}

describe('x402 signing gate', () => {
  it('refuses a swapped payee before either signature or policy reservation', async () => {
    const signTypedData = vi.fn();
    const signMessage = vi.fn();
    const authorize = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(requiredResponse(attacker));
    await expect(payForService({
      serviceName: 'search.hufu402.eth', resourceUrl: url, ensClient: serviceClient(),
      signer: { address: '0x4444444444444444444444444444444444444444', signTypedData, signMessage },
      policyOrigin: 'https://policy.example',
      policy: { authorize, settle: vi.fn() } as PolicyGateway,
      fetch: fetchMock,
    })).rejects.toThrow();
    expect(signTypedData).not.toHaveBeenCalled();
    expect(signMessage).toHaveBeenCalledOnce();
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({
      intent: expect.objectContaining({ purpose: 'preflight_refusal', payTo: attacker }),
    }));
  });
  it('refuses a price change from a selected Bazaar candidate before signing', async () => {
    const signTypedData = vi.fn();
    const signMessage = vi.fn();
    const authorize = vi.fn();
    await expect(payForService({
      serviceName: 'search.hufu402.eth', resourceUrl: url, ensClient: serviceClient(),
      signer: { address: '0x4444444444444444444444444444444444444444', signTypedData, signMessage },
      policyOrigin: 'https://policy.example', expectedAmountAtomic: 999n,
      policy: { authorize, settle: vi.fn() } as PolicyGateway,
      fetch: vi.fn().mockResolvedValue(requiredResponse(payee)),
    })).rejects.toThrow();
    expect(signTypedData).not.toHaveBeenCalled();
    expect(signMessage).toHaveBeenCalledOnce();
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({
      intent: expect.objectContaining({ purpose: 'preflight_refusal', catalogAmountAtomic: '999' }),
    }));
  });
  it.each([
    [{ name: 'USDC', version: '2', assetTransferMethod: 'permit2' }, 60, 'EIP-3009'],
    [{ name: 'Wrong token', version: '2' }, 60, 'signing domain'],
    [{ name: 'USDC', version: '2' }, 3600, 'timeout'],
  ])('rejects unsupported signing terms before authorization', async (extra, maxTimeoutSeconds, message) => {
    const signTypedData = vi.fn();
    const signMessage = vi.fn();
    const authorize = vi.fn();
    await expect(payForService({
      serviceName: 'search.hufu402.eth', resourceUrl: url, ensClient: serviceClient(),
      signer: { address: '0x4444444444444444444444444444444444444444', signTypedData, signMessage },
      policyOrigin: 'https://policy.example',
      policy: { authorize, settle: vi.fn() } as PolicyGateway,
      fetch: vi.fn().mockResolvedValue(requiredResponse(payee, { extra, maxTimeoutSeconds })),
    })).rejects.toThrow(message);
    expect(signTypedData).not.toHaveBeenCalled();
    expect(signMessage).toHaveBeenCalledOnce();
    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({
      intent: expect.objectContaining({ purpose: 'preflight_refusal' }),
    }));
  });
  it('signs a verified EIP-3009 payment and records its settlement', async () => {
    const signer = privateKeyToAccount(`0x${'77'.repeat(32)}`);
    const signTypedData = vi.spyOn(signer, 'signTypedData');
    const reservationId = 'e5606be1-daa9-4358-bdd9-19533f57f974';
    const transaction = `0x${'a'.repeat(64)}`;
    const settlement = { success: true, network: 'eip155:84532', transaction, payer: signer.address };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(requiredResponse(payee))
      .mockResolvedValueOnce(new Response('paid', { status: 200, headers: {
        'PAYMENT-RESPONSE': Buffer.from(JSON.stringify(settlement)).toString('base64'),
      } }));
    const policy = { authorize: vi.fn().mockResolvedValue({ allowed: true, reservationId }), settle: vi.fn() };
    const response = await payForService({
      serviceName: 'search.hufu402.eth', resourceUrl: url, ensClient: serviceClient(),
      signer, policyOrigin: 'https://policy.example', policy, fetch: fetchMock,
      expectedAmountAtomic: 1000n,
    });
    expect(response.status).toBe(200);
    expect(signTypedData).toHaveBeenCalledOnce();
    expect(policy.authorize).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const paidRequest = fetchMock.mock.calls[1]?.[0] as Request;
    const signatureHeader = paidRequest.headers.get('PAYMENT-SIGNATURE');
    expect(signatureHeader).toBeTruthy();
    const paymentPayload = JSON.parse(Buffer.from(signatureHeader!, 'base64').toString('utf8'));
    expect(paymentPayload.payload.authorization).toMatchObject({ to: payee, value: '1000' });
    expect(policy.settle).toHaveBeenCalledWith(expect.objectContaining({
      reservationId, transaction, outcome: 'settled',
    }));
  });
  it('continues the exact pending payment after World approval with the same signed intent', async () => {
    const signer = privateKeyToAccount(`0x${'88'.repeat(32)}`);
    const signMessage = vi.spyOn(signer, 'signMessage');
    const signTypedData = vi.spyOn(signer, 'signTypedData');
    const approvalUrl = 'https://policy.example/approve/e5606be1-daa9-4358-bdd9-19533f57f974';
    const reservationId = 'ce5a5648-fab2-4cdf-8a38-a0376ded2b05';
    const authorize = vi.fn()
      .mockResolvedValueOnce({ allowed: false, reason: 'New payee requires approval', approvalUrl })
      .mockResolvedValueOnce({ allowed: true, reservationId });
    const onApprovalRequired = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(requiredResponse(payee))
      .mockResolvedValueOnce(new Response('paid', { status: 200 }));
    const response = await payForService({
      serviceName: 'search.hufu402.eth', resourceUrl: url, ensClient: serviceClient(), signer,
      policyOrigin: 'https://policy.example', policy: { authorize, settle: vi.fn() },
      onApprovalRequired, fetch: fetchMock,
    });
    expect(response.status).toBe(200);
    expect(onApprovalRequired).toHaveBeenCalledExactlyOnceWith(approvalUrl);
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(authorize.mock.calls[1]?.[0]).toEqual(authorize.mock.calls[0]?.[0]);
    expect(signMessage).toHaveBeenCalledOnce();
    expect(signTypedData).toHaveBeenCalledOnce();
  });
  it('does not sign or submit a payment when World approval is denied', async () => {
    const signTypedData = vi.fn();
    const signMessage = vi.fn().mockResolvedValue(`0x${'a'.repeat(130)}`);
    const approvalUrl = 'https://policy.example/approve/e5606be1-daa9-4358-bdd9-19533f57f974';
    const authorize = vi.fn()
      .mockResolvedValueOnce({ allowed: false, approvalUrl, reason: 'Payment approval is pending' })
      .mockResolvedValueOnce({ allowed: false, reason: 'Payment approval was denied' });
    const fetchMock = vi.fn().mockResolvedValueOnce(requiredResponse(payee));
    await expect(payForService({
      serviceName: 'search.hufu402.eth', resourceUrl: url, ensClient: serviceClient(),
      signer: { address: '0x4444444444444444444444444444444444444444', signTypedData, signMessage },
      policyOrigin: 'https://policy.example',
      policy: { authorize, settle: vi.fn() }, onApprovalRequired: vi.fn().mockResolvedValue(undefined),
      fetch: fetchMock,
    })).rejects.toThrow('denied');
    expect(signMessage).toHaveBeenCalledOnce();
    expect(signTypedData).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
