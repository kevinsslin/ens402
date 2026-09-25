import { describe, expect, it, vi } from 'vitest';
import { discoverVerifiedServices } from '../src/discovery.js';
import { createEnsClient } from '../src/ens.js';
import { ENS_V2_PERMISSIONED_RESOLVER_IMPL } from '../src/constants.js';

const services: Record<string, { endpoint: string; payTo: string }> = {
  'alpha.eth': { endpoint: 'https://alpha.example/search', payTo: '0x1111111111111111111111111111111111111111' },
  'beta.eth': { endpoint: 'https://beta.example/search', payTo: '0x2222222222222222222222222222222222222222' },
};
function listing(name: string, resource: string, amount: string, payTo: string) {
  return {
    serviceName: name, resource, description: `Search service. ENS service: ${name}`,
    accepts: [{ scheme: 'exact', network: 'eip155:84532',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', amount, payTo }],
    quality: { l30DaysTotalCalls: 20, l30DaysUniquePayers: 5 },
  };
}

describe('Bazaar discovery', () => {
  it('ranks only catalog candidates whose endpoint and payee match ENS', async () => {
    const client = {
      getEnsText: vi.fn(async ({ name }: { name: string }) => services[name]?.endpoint),
      getEnsAddress: vi.fn(async ({ name }: { name: string }) => services[name]?.payTo),
      getEnsResolver: vi.fn().mockResolvedValue('0x3333333333333333333333333333333333333333'),
      readContract: vi.fn().mockResolvedValue(ENS_V2_PERMISSIONED_RESOLVER_IMPL),
    } as unknown as ReturnType<typeof createEnsClient>;
    const resources = [
      listing('alpha.eth', services['alpha.eth']!.endpoint, '2000', services['alpha.eth']!.payTo),
      listing('beta.eth', services['beta.eth']!.endpoint, '1000', services['beta.eth']!.payTo),
      listing('alpha.eth', 'https://attacker.example/search', '1', services['alpha.eth']!.payTo),
      listing('beta.eth', services['beta.eth']!.endpoint, '1', '0x4444444444444444444444444444444444444444'),
    ];
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ resources }), { status: 200 }));
    const ranked = await discoverVerifiedServices('search', client, request);
    expect(ranked.map(item => item.serviceName)).toEqual(['beta.eth', 'alpha.eth']);
    expect(ranked.map(item => item.priceAtomic)).toEqual([1000n, 2000n]);
    expect(request).toHaveBeenCalledOnce();
  });
});
