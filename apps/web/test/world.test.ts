import { describe, expect, it } from 'vitest';
import { enrollmentRedirectPath, isFreshWorldAuthentication } from '../src/lib/world';

describe('World proof freshness', () => {
  const start = 1_800_000_000_000;
  it('requires auth_time to belong to the current approval flow', () => {
    expect(isFreshWorldAuthentication((start + 10_000) / 1000, start, start + 20_000)).toBe(true);
    expect(isFreshWorldAuthentication((start - 60_000) / 1000, start, start + 20_000)).toBe(false);
    expect(isFreshWorldAuthentication((start + 60_000) / 1000, start, start + 20_000)).toBe(false);
  });
});

describe('enrollment return path', () => {
  const approval = 'e5606be1-daa9-4358-bdd9-19533f57f974';
  const invite = 'ce5a5648-fab2-4cdf-8a38-a0376ded2b05';
  it('returns only to a payment invitation on this site', () => {
    const path = `/approve/${approval}?invite=${invite}`;
    expect(enrollmentRedirectPath(path)).toBe(path);
    expect(enrollmentRedirectPath()).toBe('/enroll/done');
    expect(() => enrollmentRedirectPath('https://attacker.example/approve/' + approval + '?invite=' + invite)).toThrow();
    expect(() => enrollmentRedirectPath(`//attacker.example/approve/${approval}?invite=${invite}`)).toThrow();
    expect(() => enrollmentRedirectPath(`/approve/${approval}?invite=${invite}&next=https://attacker.example`)).toThrow();
  });
});
