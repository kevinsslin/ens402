/** Wallet-independent pre-signing checks. All times are Unix seconds. */
export const NETWORK = 'eip155:84532' as const;
export const USDC = '0x036cbd53842c5426634e7929541ec2318f3dcf7e' as const;
export const addressPattern = /^0x[0-9a-fA-F]{40}$/;
export const sameAddress = (a: string, b: string) => addressPattern.test(a) && addressPattern.test(b) && a.toLowerCase() === b.toLowerCase();
export const validAmount = (value: string) => /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) < 2n ** 256n;
export type PaymentConfig = { version: 1; scheme: 'exact'; network: typeof NETWORK; asset: string; payTo: string };
export type ServiceSnapshot = {
  name: string; endpoint: string; status: string; payment: PaymentConfig;
  /** Integrator-provided identity of the approved registry/resolver/control deployment. */
  authority: string; block: string; observedAt: number;
};
export type Approval = {
  name: string; authority: string; endpoints: readonly string[]; payTo: string;
  maxAmount: string; expiresAt: number;
};
export type Requirement = {
  scheme: string; network: string; asset: string; payTo: string; amount: string;
  maxTimeoutSeconds: number; extra?: Record<string, unknown>;
};
export type Trait = { risk: number; name: string; txsCount: number; description: string };
export type Scan = { toxicScore: number; traits: Trait[] };
export type RiskEvidence = {
  provider: 'intercepta'; network: 'ethereum-mainnet'; address: string;
  observedAt: number; expiresAt: number; scan: Scan; cached: boolean;
};
export type Decision = { outcome: 'continue' | 'hold' | 'reject'; reason: string };
const decision = (outcome: Decision['outcome'], reason: string): Decision => ({ outcome, reason });
export function parseScan(input: unknown): Scan {
  if (!input || typeof input !== 'object') throw new Error('Invalid screening response');
  const s = input as Scan;
  if (!Number.isFinite(s.toxicScore) || s.toxicScore < 0 || !Array.isArray(s.traits) || s.traits.length > 1000) throw new Error('Invalid screening response');
  for (const t of s.traits) {
    if (!t || !Number.isFinite(t.risk) || t.risk < 0 || typeof t.name !== 'string' || !t.name ||
      !Number.isSafeInteger(t.txsCount) || t.txsCount < 0 || typeof t.description !== 'string') throw new Error('Invalid screening trait');
  }
  return structuredClone({ toxicScore: s.toxicScore, traits: s.traits });
}
function httpsEndpoint(endpoint: string): boolean {
  try { const url = new URL(endpoint); return url.protocol === 'https:' && !url.username && !url.password && !url.hash; } catch { return false; }
}
export function verifyRequest(service: ServiceSnapshot, requestUrl: string, requirement: Requirement, approval: Approval, now: number): Decision {
  if (!Number.isFinite(now) || !Number.isFinite(approval.expiresAt) || approval.expiresAt <= now) return decision('hold', 'Approval expired');
  if (!Number.isFinite(service.observedAt) || service.observedAt > now || now - service.observedAt > 30 || !service.block) return decision('hold', 'Refresh ENS configuration');
  if (service.name !== approval.name || !service.authority || service.authority !== approval.authority) return decision('hold', 'Service identity needs approval');
  if (service.status !== 'active') return decision('hold', 'Service is not active');
  if (!httpsEndpoint(service.endpoint) || requestUrl !== service.endpoint || !approval.endpoints.includes(requestUrl)) return decision('reject', 'Endpoint is outside approved scope');
  const p = service.payment;
  if (p.version !== 1 || p.scheme !== 'exact' || p.network !== NETWORK || !sameAddress(p.asset, USDC)) return decision('reject', 'Unsupported ENS payment configuration');
  if (!sameAddress(p.payTo, approval.payTo)) return decision('hold', 'Treasury changed: approve the new recipient');
  if (requirement.scheme !== p.scheme || requirement.network !== p.network || !sameAddress(requirement.asset, p.asset) || !sameAddress(requirement.payTo, p.payTo)) return decision('reject', 'HTTP 402 does not match ENS payment settings');
  if (!validAmount(requirement.amount) || !validAmount(approval.maxAmount) || BigInt(requirement.amount) <= 0n || BigInt(requirement.amount) > BigInt(approval.maxAmount)) return decision('reject', 'Amount exceeds the approved payment limit');
  if (!Number.isInteger(requirement.maxTimeoutSeconds) || requirement.maxTimeoutSeconds < 1 || requirement.maxTimeoutSeconds > 300 || now + requirement.maxTimeoutSeconds >= approval.expiresAt) return decision('reject', 'Payment authorization lasts too long');
  if (requirement.extra?.name !== 'USDC' || requirement.extra?.version !== '2' || (requirement.extra.assetTransferMethod !== undefined && requirement.extra.assetTransferMethod !== 'eip3009')) return decision('reject', 'Unsupported payment signing format');
  return decision('continue', 'Endpoint, recipient, token, network and amount match');
}
export function evaluateRisk(evidence: RiskEvidence, payTo: string, now: number): Decision {
  if (evidence.provider !== 'intercepta' || evidence.network !== 'ethereum-mainnet' || !sameAddress(evidence.address, payTo)) return decision('hold', 'Screening evidence does not cover this recipient');
  if (!Number.isFinite(evidence.observedAt) || !Number.isFinite(evidence.expiresAt) || evidence.observedAt > now || evidence.expiresAt <= now || evidence.expiresAt - evidence.observedAt > 3600) return decision('hold', 'Refresh screening evidence');
  let scan: Scan;
  try { scan = parseScan(evidence.scan); } catch { return decision('hold', 'Invalid screening evidence'); }
  if (scan.traits.some(t => t.name === 'known_scammer' || t.name === 'sanction_address')) return decision('reject', 'Blocking address attribution returned by Intercepta');
  // Deliberately conservative demo policy, not provider-prescribed score thresholds.
  if (scan.traits.length || scan.toxicScore !== 0) return decision('hold', 'Risk signals need review');
  return decision('continue', 'No risk signals returned; service quality remains unverified');
}
