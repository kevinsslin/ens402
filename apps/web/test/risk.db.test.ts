import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { database } from '../src/lib/db';
import { getRisk } from '../src/lib/risk';

const address = `0x${randomBytes(20).toString('hex')}` as const;
const fetchMock = vi.fn(async () => new Response(JSON.stringify({ toxicScore: 0, traits: [] }), {
  status: 200, headers: { 'content-type': 'application/json' },
}));

describe.skipIf(!process.env.DATABASE_URL)('risk cache with PostgreSQL', () => {
  beforeAll(() => {
    process.env.INTERCEPTA_API_KEY = 'test-key';
    vi.stubGlobal('fetch', fetchMock);
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    if (!process.env.DATABASE_URL) return;
    await database().query('DELETE FROM risk_results WHERE address=$1', [address.toLowerCase()]);
    await database().end();
  });

  it('coalesces concurrent scans and keeps expiry fixed across cache hits', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => getRisk(address)));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.every(result => result.tier === 'low' && result.expiresAt === results[0]?.expiresAt)).toBe(true);
    const cached = await getRisk(address);
    expect(cached.expiresAt).toBe(results[0]?.expiresAt);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await database().query("UPDATE risk_results SET expires_at=now()-interval '1 second' WHERE address=$1", [address.toLowerCase()]);
    await getRisk(address);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
