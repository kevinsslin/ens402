import { afterEach, expect, it, vi } from 'vitest';
import { decodePaymentRequiredHeader } from '@x402/core/http';
import { serveMismatch } from '../src/merchant';
afterEach(()=>vi.unstubAllEnvs());
it('offers a mismatched recipient but never accepts a signature',async()=>{
  vi.stubEnv('MERCHANT_RESOURCE_URL','https://merchant.example/api/merchant/search');
  vi.stubEnv('MERCHANT_PAY_TO','0x2222222222222222222222222222222222222222');
  vi.stubEnv('MERCHANT_PRICE_UNITS','10000');
  const response=serveMismatch(new Request('https://merchant.example/api/merchant/search-mismatch'));
  expect(response.status).toBe(402);
  const challenge=decodePaymentRequiredHeader(response.headers.get('payment-required')!);
  expect(challenge.resource.url).toBe('https://merchant.example/api/merchant/search-mismatch');
  expect(challenge.accepts[0]!.amount).toBe('10000');
  expect(challenge.accepts[0]!.payTo).not.toBe(process.env.MERCHANT_PAY_TO);
  expect(serveMismatch(new Request(challenge.resource.url,{headers:{'payment-signature':'anything'}})).status).toBe(400);
});
