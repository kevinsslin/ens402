import { addressPattern, parseScan, type RiskEvidence } from './index';

/** Keep this adapter on a trusted server. Never expose the API key to the browser. */
export class InterceptaProvider {
  private cache = new Map<string, RiskEvidence>();
  private pending = new Map<string, Promise<RiskEvidence>>();
  constructor(private options: { apiKey: string; fetch?: typeof fetch; now?: () => number; ttlSeconds?: number }) {
    if (!options.apiKey) throw new Error('INTERCEPTA_API_KEY is required');
    if (options.ttlSeconds !== undefined && (!Number.isInteger(options.ttlSeconds) || options.ttlSeconds < 1 || options.ttlSeconds > 3600)) throw new Error('Screening TTL must be 1 to 3600 seconds');
  }
  async screen(address: string): Promise<RiskEvidence> {
    if (!addressPattern.test(address)) throw new Error('Invalid screening address');
    const key = address.toLowerCase();
    const now = this.options.now?.() ?? Math.floor(Date.now() / 1000);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > now && cached.observedAt <= now) return structuredClone({ ...cached, cached: true });
    const existing = this.pending.get(key);
    if (existing) return structuredClone(await existing);
    const request = this.scan(key);
    this.pending.set(key, request);
    try { return structuredClone(await request); } finally { this.pending.delete(key); }
  }
  private async scan(address: string): Promise<RiskEvidence> {
    try {
      const response = await (this.options.fetch ?? fetch)(`https://api.web3antivirus.io/api/public/v2/extension/account/${address}/quick-scan`, {
        headers: { 'X-API-KEY': this.options.apiKey, Accept: 'application/json', 'User-Agent': 'ens402/0.1' },
        signal: AbortSignal.timeout(10000), redirect: 'error',
      });
      if (!response.ok) throw new Error('Screening unavailable');
      const scan = parseScan(await response.json());
      const now = this.options.now?.() ?? Math.floor(Date.now() / 1000);
      const evidence: RiskEvidence = { provider: 'intercepta', network: 'ethereum-mainnet', address, observedAt: now, expiresAt: now + (this.options.ttlSeconds ?? 3600), scan, cached: false };
      // Bounded, process-local optimization; expiry never becomes a clean fallback.
      if (this.cache.size >= 1000) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(address, structuredClone(evidence));
      return evidence;
    } catch { throw new Error('Intercepta evidence unavailable; hold payment'); }
  }
}
