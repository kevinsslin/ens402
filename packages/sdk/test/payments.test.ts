import { describe, expect, it, vi } from 'vitest';
import { PrivyClient } from '@privy-io/node';
import { privateKeyToAccount } from 'viem/accounts';
import { verifyTypedData, type Address, type Hex } from 'viem';
import { authorizationTypes } from '@x402/evm';
import { NETWORK, USDC, verifyRequest, evaluateRisk, type Approval, type ServiceSnapshot, type Requirement, type RiskEvidence } from '../src/index';
import { InterceptaProvider } from '../src/intercepta';
import { preparePayment } from '../src/x402';
import { buildPrivyPolicy, createPrivySigner, paymentTypes, privyPaymentInput, type TypedInput } from '../src/privy';

// Public deterministic test key, never used on a network.
const account = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const payTo = '0x2222222222222222222222222222222222222222';
const now = Math.floor(Date.now() / 1000);
const scope = { payTo, maxAmount: '10000', expiresAt: now + 600 };
const approval: Approval = { ...scope, name: 'search.example.eth', authority: 'pinned-test-deployment', endpoints: ['https://api.example.test/v1', 'https://api.example.test/v2'] };
const service: ServiceSnapshot = { name: approval.name, authority: approval.authority, endpoint: approval.endpoints[0]!, status: 'active', observedAt: now, block: '123', payment: { version: 1, scheme: 'exact', network: NETWORK, asset: USDC, payTo } };
const requirement: Requirement = { scheme: 'exact', network: NETWORK, asset: USDC, payTo, amount: '100', maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' } };
const evidence: RiskEvidence = { provider: 'intercepta', network: 'ethereum-mainnet', address: payTo, observedAt: now, expiresAt: now + 3600, cached: false, scan: { toxicScore: 0, traits: [] } };
function input() { return { service: structuredClone(service), requestUrl: service.endpoint, requirement: structuredClone(requirement), approval: structuredClone(approval), screen: vi.fn(async () => structuredClone(evidence)), signer: { address: account.address, signTypedData: vi.fn(account.signTypedData) }, now: () => now }; }

describe('pre-signing boundary', () => {
  it('signs a real upstream x402 EIP-3009 payload with verifiable signature', async () => {
    const result = await preparePayment(input());
    expect(result.decision.outcome).toBe('continue');
    const payload = result.payload!.payload as { signature: Hex; authorization: { from: Address; to: Address; value: string; validAfter: string; validBefore: string; nonce: Hex } };
    expect(await verifyTypedData({ address: account.address, domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC }, types: authorizationTypes, primaryType: 'TransferWithAuthorization', message: { ...payload.authorization, value: BigInt(payload.authorization.value), validAfter: BigInt(payload.authorization.validAfter), validBefore: BigInt(payload.authorization.validBefore) }, signature: payload.signature })).toBe(true);
  });
  it.each([
    ['recipient', { payTo: account.address }], ['chain', { network: 'eip155:1' }], ['asset', { asset: account.address }],
    ['amount', { amount: '10001' }], ['negative amount', { amount: '-1' }], ['exponent amount', { amount: '1e2' }], ['zero', { amount: '0' }],
    ['uint overflow', { amount: String(2n ** 256n) }], ['scheme', { scheme: 'upto' }], ['duration', { maxTimeoutSeconds: 301 }],
    ['domain name', { extra: { name: 'Other', version: '2' } }], ['Permit2', { extra: { name: 'USDC', version: '2', assetTransferMethod: 'permit2' } }],
  ])('rejects changed %s before screening or signing', async (_name, change) => {
    const args = input(); Object.assign(args.requirement, change);
    expect((await preparePayment(args)).decision.outcome).toBe('reject');
    expect(args.screen).not.toHaveBeenCalled(); expect(args.signer.signTypedData).not.toHaveBeenCalled();
  });
  it('follows an approved endpoint change but rejects unapproved routes', () => {
    const moved = { ...service, endpoint: approval.endpoints[1]! };
    expect(verifyRequest(moved, moved.endpoint, requirement, approval, now).outcome).toBe('continue');
    expect(verifyRequest(moved, 'https://attacker.test/', requirement, approval, now).outcome).toBe('reject');
  });
  it.each(['authority', 'status', 'observedAt', 'payTo', 'expiresAt'])('holds changed %s', async field => {
    const args = input();
    if (field === 'authority') args.service.authority = 'new-owner';
    if (field === 'status') args.service.status = 'suspended';
    if (field === 'observedAt') args.service.observedAt = now - 31;
    if (field === 'payTo') args.service.payment.payTo = account.address;
    if (field === 'expiresAt') args.approval.expiresAt = now;
    expect((await preparePayment(args)).decision.outcome).toBe('hold'); expect(args.signer.signTypedData).not.toHaveBeenCalled();
  });
  it('holds provider failures without signing', async () => {
    const args = input(); args.screen.mockRejectedValue(new Error('private provider details'));
    const result = await preparePayment(args);
    expect(result.decision.outcome).toBe('hold'); expect(JSON.stringify(result)).not.toContain('private'); expect(args.signer.signTypedData).not.toHaveBeenCalled();
  });
  it('checks freshness again after slow screening', async () => {
    const args = input(); let time = now; args.now = () => time;
    args.screen.mockImplementation(async () => { time += 31; return evidence; });
    expect((await preparePayment(args)).decision.outcome).toBe('hold'); expect(args.signer.signTypedData).not.toHaveBeenCalled();
  });
  it('snapshots caller data before asynchronous screening', async () => {
    const args = input(); args.screen.mockImplementation(async () => { args.requirement.payTo = account.address; return evidence; });
    const result = await preparePayment(args);
    expect((result.payload?.payload as { authorization: { to: string } }).authorization.to.toLowerCase()).toBe(payTo);
  });
});

describe('screening evidence', () => {
  it.each(['known_scammer', 'sanction_address'])('rejects %s', name => {
    expect(evaluateRisk({ ...evidence, scan: { toxicScore: 0, traits: [{ name, risk: 1, txsCount: 1, description: 'Fixture' }] } }, payTo, now).outcome).toBe('reject');
  });
  it.each(['sanction_address_communication', 'new_unknown_trait'])('holds %s without equating exposure to attribution', name => {
    expect(evaluateRisk({ ...evidence, scan: { toxicScore: 0, traits: [{ name, risk: 1, txsCount: 1, description: 'Fixture' }] } }, payTo, now).outcome).toBe('hold');
  });
  it('holds expired or wrong-address evidence', () => {
    expect(evaluateRisk(evidence, account.address, now).outcome).toBe('hold');
    expect(evaluateRisk(evidence, payTo, evidence.expiresAt).outcome).toBe('hold');
  });
  it('caches fresh results, isolates addresses, and does not reuse expired results on failure', async () => {
    let time = now;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ toxicScore: 0, traits: [] })));
    const provider = new InterceptaProvider({ apiKey: 'fake-test-key', fetch: fetcher, now: () => time, ttlSeconds: 10 });
    const first = await provider.screen(payTo); first.scan.toxicScore = 999;
    expect((await provider.screen(payTo)).scan.toxicScore).toBe(0);
    expect((await provider.screen(payTo)).cached).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValueOnce(new Response('{}', { status: 503 }));
    await expect(provider.screen(account.address)).rejects.toThrow('hold payment');
    time += 10; fetcher.mockResolvedValueOnce(new Response('{}', { status: 403 }));
    await expect(provider.screen(payTo)).rejects.toThrow('hold payment'); expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls[0]![1]?.headers).toMatchObject({ 'User-Agent': 'ens402/0.1' });
  });
  it.each([{}, { toxicScore: 0, traits: [{}] }, { toxicScore: -1, traits: [] }])('rejects malformed response %j', async body => {
    const provider = new InterceptaProvider({ apiKey: 'fake', fetch: vi.fn().mockResolvedValue(Response.json(body)) });
    await expect(provider.screen(payTo)).rejects.toThrow('hold payment');
  });
  it('coalesces concurrent scans and sanitizes network errors', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ toxicScore: 0, traits: [] }));
    const provider = new InterceptaProvider({ apiKey: 'fake', fetch: fetcher });
    await Promise.all([provider.screen(payTo), provider.screen(payTo)]); expect(fetcher).toHaveBeenCalledTimes(1);
    const broken = new InterceptaProvider({ apiKey: 'secret', fetch: vi.fn().mockRejectedValue(new Error('secret')) });
    await expect(broken.screen(payTo)).rejects.toThrow('Intercepta evidence unavailable; hold payment');
  });
});

const typed = (): TypedInput => ({ domain: { name: 'USDC', version: '2', chainId: 84532, verifyingContract: USDC }, types: structuredClone(authorizationTypes), primaryType: 'TransferWithAuthorization', message: { from: account.address, to: payTo, value: 100n, validAfter: 0n, validBefore: BigInt(now + 60), nonce: `0x${'00'.repeat(32)}` } });
describe('Privy adapter and policy', () => {
  it('uses default deny with a single restrictive typed-data allow', () => {
    const policy = buildPrivyPolicy(scope);
    expect(policy.rules).toHaveLength(1);
    expect(policy.rules[0]?.method).toBe('eth_signTypedData_v4');
    const conditions = policy.rules[0]!.conditions;
    expect(conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'to', value: payTo }), expect.objectContaining({ field: 'value', operator: 'lte', value: '10000' }),
      expect.objectContaining({ field: 'chainId', value: '84532' }), expect.objectContaining({ field: 'verifyingContract', value: USDC }),
    ]));
    const normalized = privyPaymentInput(typed(), account.address, scope, now);
    for (const condition of conditions) if (condition.field_source === 'ethereum_typed_data_message') expect(condition.typed_data.types).toEqual(normalized.types);
  });
  it.each(['extra type', 'reordered fields', 'recipient', 'domain', 'long expiry', 'wrong payer'])('refuses %s before provider call', change => {
    const data = typed();
    if (change === 'extra type') data.types.Unused = [];
    if (change === 'reordered fields') data.types.TransferWithAuthorization = [...authorizationTypes.TransferWithAuthorization].reverse();
    if (change === 'recipient') data.message.to = account.address;
    if (change === 'domain') data.domain.chainId = 1;
    if (change === 'long expiry') data.message.validBefore = BigInt(now + 301);
    if (change === 'wrong payer') data.message.from = payTo;
    expect(() => privyPaymentInput(data, account.address, scope, now)).toThrow();
  });
  it('round-trips through the actual Privy Node SDK transport and upstream x402 signer', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      expect(body.method).toBe('eth_signTypedData_v4');
      const d = body.params.typed_data;
      expect(d.types).toEqual(paymentTypes);
      const signature = await account.signTypedData({ domain: d.domain, types: d.types, primaryType: d.primary_type, message: d.message });
      return Response.json({ method: 'eth_signTypedData_v4', data: { signature, encoding: 'hex' } });
    });
    const client = new PrivyClient({ appId: 'fake', appSecret: 'fake', fetch: fetcher, maxRetries: 0 });
    const args = input();
    const signer = createPrivySigner({ client, walletId: 'test', address: account.address, scope, now: () => now });
    expect((await preparePayment({ ...args, signer })).decision.outcome).toBe('continue');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects signatures from an unexpected wallet', async () => {
    const other = privateKeyToAccount(`0x${'22'.repeat(32)}`);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
      const d = JSON.parse(String(options?.body)).params.typed_data;
      return Response.json({ method: 'eth_signTypedData_v4', data: { signature: await other.signTypedData({ domain: d.domain, types: d.types, primaryType: d.primary_type, message: d.message }), encoding: 'hex' } });
    });
    const client = new PrivyClient({ appId: 'fake', appSecret: 'fake', fetch: fetcher, maxRetries: 0 });
    const signer = createPrivySigner({ client, walletId: 'test', address: account.address, scope, now: () => now });
    await expect(signer.signTypedData(typed())).rejects.toThrow('did not match');
  });
});
