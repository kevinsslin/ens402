import { describe, it, expect, vi } from 'vitest';
import { canonicalMetadata, metadataExtension } from '../src/metadata';
import type { CallMetadata } from '../src/call';
import { createServer } from 'node:http';
import { privateKeyToAccount } from 'viem/accounts';
import { encodeEventTopics, encodeAbiParameters, parseAbi, verifyTypedData, type PublicClient, type Hex } from 'viem';
import { authorizationTypes } from '@x402/evm';
import { encodePaymentRequiredHeader, decodePaymentSignatureHeader, encodePaymentResponseHeader } from '@x402/core/http';
import type { PaymentRequirements } from '@x402/core/types';
import { NETWORK, USDC, type ServiceSnapshot, type Approval, type RiskEvidence } from '../src/index';
import { parseChallenge, purchaseResource, type ResourceTransport, type PublicAuthorization } from '../src/http';
import { verifySettlement } from '../src/settlement';
import { parsePaymentRecord, prepareRecordUpdate, prepareTextPermission, type ResolvedService } from '../src/ens';

const payer = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const recipient = '0x2222222222222222222222222222222222222222';
const endpoint = 'https://merchant.example/search';
const now = Math.floor(Date.now() / 1000);
const requirement: PaymentRequirements = { scheme: 'exact', network: NETWORK, asset: USDC, payTo: recipient, amount: '10000', maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' } };
const service: ServiceSnapshot = { name: 'search.example.eth', endpoint, status: 'active', authority: 'fixture', block: '123', observedAt: now, payment: { version: 1, scheme: 'exact', network: NETWORK, asset: USDC, payTo: recipient } };
const approval: Approval = { name: service.name, authority: service.authority, endpoints: [endpoint], payTo: recipient, maxAmount: '10000', expiresAt: now + 600 };
const evidence: RiskEvidence = { provider: 'intercepta', network: 'ethereum-mainnet', address: recipient, observedAt: now, expiresAt: now + 3600, cached: false, scan: { toxicScore: 0, traits: [] } };
const challenge = { x402Version: 2, resource: { url: endpoint }, accepts: [requirement] };
const tx = `0x${'ab'.repeat(32)}` as Hex;
const settlement = { success: true, transaction: tx, network: NETWORK, payer: payer.address };
const invoice = () => new Response(null, { status: 402, headers: { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(challenge) } });
function options() {
  return { name: service.name, approval, resolve: vi.fn(async () => service), screen: vi.fn(async () => evidence), signer: { address: payer.address, signTypedData: vi.fn(payer.signTypedData) }, transport: vi.fn<ResourceTransport>().mockResolvedValueOnce(invoice()).mockResolvedValue(new Response('resource', { headers: { 'PAYMENT-RESPONSE': encodePaymentResponseHeader(settlement) } })), beforeSubmit: vi.fn(async () => {}), verifySettlement: vi.fn(async () => {}), now: () => now };
}
describe('actual HTTP payment exchange', () => {
  it('sends the standard signed header once and receives a resource over real HTTP', async () => {
    let signatures = 0;
    const server = createServer(async (request, response) => {
      const header = request.headers['payment-signature'];
      if (!header) { response.writeHead(402, { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader(challenge) }); response.end(); return; }
      try {
        signatures++;
        const payload = decodePaymentSignatureHeader(String(header));
        expect(payload.accepted).toEqual(requirement);
        const a = payload.payload.authorization as PublicAuthorization;
        expect(await verifyTypedData({ address: payer.address, domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC }, types: authorizationTypes, primaryType: 'TransferWithAuthorization', message: { from: a.from as Hex, to: a.to as Hex, value: BigInt(a.value), validAfter: BigInt(a.validAfter), validBefore: BigInt(a.validBefore), nonce: a.nonce as Hex }, signature: payload.payload.signature as Hex })).toBe(true);
        response.writeHead(200, { 'PAYMENT-RESPONSE': encodePaymentResponseHeader(settlement) }); response.end('{"search":"delivered"}');
      } catch { response.writeHead(500); response.end(); }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const args = options();
      const transport: ResourceTransport = async (url, init) => { expect(url).toBe(endpoint); return fetch(`http://127.0.0.1:${port}/search`, init); };
      const result = await purchaseResource({ ...args, transport });
      expect(result.state).toBe('settled'); expect(result.resource).toContain('delivered'); expect(signatures).toBe(1);
      expect(args.beforeSubmit).toHaveBeenCalledOnce(); expect(args.verifySettlement).toHaveBeenCalledOnce(); expect(args.resolve).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(result)).not.toContain('signature');
    } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
  });
  it('rejects a changed payee without screening or signing', async () => {
    const args = options(); args.transport.mockReset().mockResolvedValue(new Response(null, { status: 402, headers: { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader({ ...challenge, accepts: [{ ...requirement, payTo: payer.address }] }) } }));
    const receipt = await purchaseResource(args); expect(receipt.state).toBe('rejected'); expect(receipt.offeredRequirements?.[0]?.payTo).toBe(payer.address); expect(receipt.requirement).toBeUndefined(); expect(args.signer.signTypedData).not.toHaveBeenCalled(); expect(args.screen).not.toHaveBeenCalled();
  });
  it('rechecks ENS immediately before signing', async () => {
    const args = options(); args.resolve.mockResolvedValueOnce(service).mockResolvedValue({ ...service, authority: 'changed-owner' });
    expect((await purchaseResource(args)).state).toBe('held'); expect(args.signer.signTypedData).not.toHaveBeenCalled(); expect(args.beforeSubmit).not.toHaveBeenCalled();
  });
  it.each(['backend', 'fresh ENS'])('blocks %s metadata drift before signing', async kind => {
    const call: CallMetadata = { verification: 'ens402.service.v1', method: 'GET', inputSchema: { type: 'object' }, outputSchema: { type: 'object' } };
    const verified = { ...service, description: 'Weather forecast', call };
    const args = options();
    args.approval = { ...approval, metadataHash: canonicalMetadata(verified.description, call).hash } as typeof approval;
    args.resolve.mockResolvedValueOnce(verified).mockResolvedValue(kind === 'fresh ENS' ? { ...verified, description: 'Changed forecast' } : verified);
    args.transport.mockReset().mockResolvedValue(new Response(null, { status: 402, headers: { 'PAYMENT-REQUIRED': encodePaymentRequiredHeader({ ...challenge, resource: { url: endpoint, description: kind === 'backend' ? 'Changed forecast' : verified.description }, extensions: metadataExtension(verified.description, call) }) } }));
    expect((await purchaseResource(args)).state).toBe('held');
    expect(args.signer.signTypedData).not.toHaveBeenCalled();
    expect(args.beforeSubmit).not.toHaveBeenCalled();
  });
  it('does not transmit a signature when durable journaling fails', async () => {
    const args = options(); args.beforeSubmit.mockRejectedValue(new Error('database down'));
    expect((await purchaseResource(args)).state).toBe('held'); expect(args.transport).toHaveBeenCalledTimes(1);
  });
  it('does not retry or re-sign after submission timeout', async () => {
    const args = options(); args.transport.mockReset().mockResolvedValueOnce(invoice()).mockRejectedValue(new Error('timeout'));
    expect((await purchaseResource(args)).state).toBe('uncertain'); expect(args.signer.signTypedData).toHaveBeenCalledTimes(1); expect(args.transport).toHaveBeenCalledTimes(2);
  });
  it('does not trust an HTTP success without chain receipt verification', async () => {
    const args = options(); args.verifySettlement.mockRejectedValue(new Error('wrong nonce'));
    const receipt = await purchaseResource(args);
    expect(receipt.state).toBe('uncertain'); expect(receipt.steps.at(-1)).toEqual({ stage: 'stop', detail: 'Could not confirm the settlement transaction onchain' });
  });
  it('keeps a reported settlement failure uncertain but records its reason code', async () => {
    const failed = { success: false, errorReason: 'invalid_exact_evm_transaction_failed', errorMessage: 'Details: replacement transaction underpriced\n<raw tx>', transaction: '', network: 'eip155:84532' as const };
    const args = options(); args.transport.mockReset().mockResolvedValueOnce(invoice()).mockResolvedValue(new Response('{"error":"Settlement failed"}', { status: 402, headers: { 'PAYMENT-RESPONSE': encodePaymentResponseHeader(failed) } }));
    const receipt = await purchaseResource(args);
    expect(receipt.state).toBe('uncertain'); expect(args.signer.signTypedData).toHaveBeenCalledTimes(1);
    expect(receipt.steps.at(-1)).toEqual({ stage: 'stop', detail: 'Merchant reported a failed settlement: invalid_exact_evm_transaction_failed' });
  });
  it('records a missing settlement receipt with the merchant status', async () => {
    const args = options(); args.transport.mockReset().mockResolvedValueOnce(invoice()).mockResolvedValue(new Response(null, { status: 503 }));
    expect((await purchaseResource(args)).steps.at(-1)).toEqual({ stage: 'stop', detail: 'Merchant returned HTTP 503 without a settlement receipt' });
  });
  it('records payment even when the service failed to deliver', async () => {
    const args = options(); args.transport.mockReset().mockResolvedValueOnce(invoice()).mockResolvedValue(new Response('service error', { status: 500, headers: { 'PAYMENT-RESPONSE': encodePaymentResponseHeader(settlement) } }));
    expect((await purchaseResource(args)).state).toBe('paid_delivery_failed');
  });
  it('bounds paid response bodies without losing the settlement outcome', async () => {
    const args = options(); args.transport.mockReset().mockResolvedValueOnce(invoice()).mockResolvedValue(new Response('x'.repeat(65537), { headers: { 'PAYMENT-RESPONSE': encodePaymentResponseHeader(settlement) } }));
    expect((await purchaseResource(args)).state).toBe('paid_delivery_failed');
  });
  it('rejects malformed challenges and resource substitution', () => {
    expect(() => parseChallenge('not JSON', endpoint)).toThrow();
    expect(() => parseChallenge(encodePaymentRequiredHeader(challenge), 'https://different.example/')).toThrow();
    expect(() => parseChallenge('x'.repeat(32769), endpoint)).toThrow();
  });
});

const tokenEvents = parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)', 'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)']);
const nonce = `0x${'01'.repeat(32)}` as Hex;
const authorization: PublicAuthorization = { from: payer.address, to: recipient, value: '10000', validAfter: '0', validBefore: String(now + 60), nonce };
function logs() { return [
  { address: USDC, topics: encodeEventTopics({ abi: tokenEvents, eventName: 'Transfer', args: { from: payer.address, to: recipient } }), data: encodeAbiParameters([{ type: 'uint256' }], [10000n]) },
  { address: USDC, topics: encodeEventTopics({ abi: tokenEvents, eventName: 'AuthorizationUsed', args: { authorizer: payer.address, nonce } }), data: '0x' },
]; }
describe('settlement proof', () => {
  it.each(['valid', 'wrong token', 'wrong nonce', 'missing transfer', 'reverted', 'wrong chain'])('checks %s', async kind => {
    const entries = logs();
    if (kind === 'wrong token') entries[0]!.address = recipient as typeof USDC;
    if (kind === 'wrong nonce') entries[1]!.topics = encodeEventTopics({ abi: tokenEvents, eventName: 'AuthorizationUsed', args: { authorizer: payer.address, nonce: tx } });
    if (kind === 'missing transfer') entries.shift();
    const client = { getChainId: async () => kind === 'wrong chain' ? 1 : 84532, waitForTransactionReceipt: async () => ({ status: kind === 'reverted' ? 'reverted' : 'success', logs: entries }) } as unknown as PublicClient;
    if (kind === 'valid') await expect(verifySettlement(client, settlement, authorization, requirement)).resolves.toBeUndefined();
    else await expect(verifySettlement(client, settlement, authorization, requirement)).rejects.toThrow();
  });
});
describe('ENS transaction input validation', () => {
  const resolved: ResolvedService = { ...service, resolver: recipient, implementation: recipient, owner: payer.address, parentRegistry: recipient, blockHash: tx, recordVersion: '0', authorityCoverage: [] };
  it.each(['http://localhost/', 'https://user:pass@example.com/', 'https://example.com/#fragment'])('rejects unsafe endpoint %s', value => expect(() => prepareRecordUpdate(resolved, 'agent-endpoint[x402]', value)).toThrow());
  it('rejects unsupported payment config and empty operators', () => {
    expect(() => parsePaymentRecord(JSON.stringify({ ...service.payment, network: 'eip155:1' }))).toThrow();
    expect(() => prepareTextPermission(resolved, 'ens402.payment', '0x0000000000000000000000000000000000000000', true)).toThrow();
  });
});
