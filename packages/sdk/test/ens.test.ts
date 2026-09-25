import { describe, expect, it, vi } from 'vitest';
import { resolveServiceAuthority, type createEnsClient } from '../src/ens.js';

describe('ENS authority', () => {
  it('refuses an RPC on another chain before reading merchant records', async () => {
    const getEnsText = vi.fn();
    const client = {
      getChainId: vi.fn().mockResolvedValue(1),
      getEnsText,
    } as unknown as ReturnType<typeof createEnsClient>;
    await expect(resolveServiceAuthority(client, 'search.hufu402.eth')).rejects.toThrow('ENS RPC is not on Sepolia');
    expect(getEnsText).not.toHaveBeenCalled();
  });
});
