import { getAddress, type Address } from 'viem';
import { z } from 'zod';
import { database, transaction } from './db';

const riskResponse = z.object({
  toxicScore: z.number().finite(),
  traits: z.array(z.object({
    name: z.string(), risk: z.number().finite(),
    description: z.string().optional(), txsCount: z.number().optional(),
  })),
});

const highTraits = new Set(['known_scammer', 'sanction_address', 'blacklist', 'attack_money_target', 'fake_phishing_transfer']);
export type RiskTier = 'low' | 'medium' | 'high';
export interface RiskResult {
  tier: RiskTier;
  score: number;
  reasons: string[];
  scannedAt: string;
  expiresAt: string;
}

export function interpretRisk(raw: z.infer<typeof riskResponse>): Pick<RiskResult, 'tier' | 'score' | 'reasons'> {
  const active = raw.traits.filter(trait => trait.risk > 0 || (trait.txsCount ?? 0) > 0);
  const reasons = active.map(trait => trait.name);
  if (active.some(trait => highTraits.has(trait.name))) return { tier: 'high', score: raw.toxicScore, reasons };
  if (raw.toxicScore === 0 && active.length === 0) return { tier: 'low', score: 0, reasons: [] };
  return { tier: 'medium', score: raw.toxicScore, reasons: reasons.length ? reasons : ['nonzero_toxic_score'] };
}

export async function getRisk(address: Address): Promise<RiskResult> {
  const normalized = getAddress(address).toLowerCase();
  const existing = await database().query<{
    tier: RiskTier; toxic_score: string; reasons: string[]; scanned_at: Date; expires_at: Date;
  }>('SELECT tier, toxic_score, reasons, scanned_at, expires_at FROM risk_results WHERE address=$1 AND expires_at > now() AND interpretation_version=1', [normalized]);
  if (existing.rows[0]) {
    const row = existing.rows[0];
    return { tier: row.tier, score: Number(row.toxic_score), reasons: row.reasons, scannedAt: row.scanned_at.toISOString(), expiresAt: row.expires_at.toISOString() };
  }
  return transaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [normalized]);
    const fresh = await db.query<{
      tier: RiskTier; toxic_score: string; reasons: string[]; scanned_at: Date; expires_at: Date;
    }>('SELECT tier,toxic_score,reasons,scanned_at,expires_at FROM risk_results WHERE address=$1 AND expires_at > now() AND interpretation_version=1', [normalized]);
    if (fresh.rows[0]) {
      const row = fresh.rows[0];
      return { tier: row.tier, score: Number(row.toxic_score), reasons: row.reasons,
        scannedAt: row.scanned_at.toISOString(), expiresAt: row.expires_at.toISOString() };
    }
    const apiKey = process.env.INTERCEPTA_API_KEY;
    if (!apiKey) throw new Error('Intercepta API key is not configured');
    const response = await fetch(`https://api.web3antivirus.io/api/public/v2/extension/account/${normalized}/quick-scan`, {
      headers: { 'X-API-KEY': apiKey }, signal: AbortSignal.timeout(10000), cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Intercepta scan failed with HTTP ${response.status}`);
    const raw = riskResponse.parse(await response.json());
    const interpreted = interpretRisk(raw);
    const scannedAt = new Date();
    const expiresAt = new Date(scannedAt.getTime() + 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO risk_results (address, tier, toxic_score, reasons, raw, interpretation_version, scanned_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,1,$6,$7)
       ON CONFLICT (address) DO UPDATE SET tier=EXCLUDED.tier, toxic_score=EXCLUDED.toxic_score, reasons=EXCLUDED.reasons,
         raw=EXCLUDED.raw, interpretation_version=1, scanned_at=EXCLUDED.scanned_at, expires_at=EXCLUDED.expires_at`,
      [normalized, interpreted.tier, interpreted.score, interpreted.reasons, JSON.stringify(raw), scannedAt, expiresAt],
    );
    return { ...interpreted, scannedAt: scannedAt.toISOString(), expiresAt: expiresAt.toISOString() };
  });
}
