import { describe, expect, it } from 'vitest';
import { verifyPayment, type PaymentCandidate } from '../src/payment.js';
import type { ServiceAuthority } from '../src/ens.js';

const authority: ServiceAuthority = {
  name: 'search.hufu402.eth',
  endpoint: 'https://merchant.example/search',
  payTo: '0x1111111111111111111111111111111111111111',
  resolver: '0x2222222222222222222222222222222222222222',
  implementation: '0x3333333333333333333333333333333333333333',
};
const candidate: PaymentCandidate = {
  serviceName: authority.name,
  resourceUrl: authority.endpoint,
  payer: '0x4444444444444444444444444444444444444444',
  requirement: {
    scheme: 'exact', network: 'eip155:84532',
    asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    payTo: authority.payTo, amount: '1000',
  },
};

describe('payment authority', () => {
  it('accepts a matching exact Base Sepolia USDC payment', () => {
    expect(verifyPayment(candidate, authority).amountAtomic).toBe(1000n);
  });
  it.each([
    [{ ...candidate, resourceUrl: 'https://merchant.example/other' }, 'Service URL'],
    [{ ...candidate, requirement: { ...candidate.requirement, payTo: '0x5555555555555555555555555555555555555555' } }, 'payTo'],
    [{ ...candidate, requirement: { ...candidate.requirement, network: 'eip155:8453' } }, 'network'],
    [{ ...candidate, requirement: { ...candidate.requirement, asset: '0x5555555555555555555555555555555555555555' } }, 'asset'],
    [{ ...candidate, requirement: { ...candidate.requirement, amount: '0' } }, 'amount'],
  ])('rejects unapproved payment terms', (input, message) => {
    expect(() => verifyPayment(input as PaymentCandidate, authority)).toThrow(message);
  });
});
