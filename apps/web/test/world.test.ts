import { describe, expect, it } from 'vitest';
import { isFreshWorldAuthentication } from '../src/lib/world';

describe('World proof freshness', () => {
  const start = 1_800_000_000_000;
  it('requires auth_time to belong to the current approval flow', () => {
    expect(isFreshWorldAuthentication((start + 10_000) / 1000, start, start + 20_000)).toBe(true);
    expect(isFreshWorldAuthentication((start - 60_000) / 1000, start, start + 20_000)).toBe(false);
    expect(isFreshWorldAuthentication((start + 60_000) / 1000, start, start + 20_000)).toBe(false);
  });
});
