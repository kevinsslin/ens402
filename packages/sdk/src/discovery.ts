import { getAddress, isAddress } from 'viem';
import { normalize } from 'viem/ens';
import { BASE_SEPOLIA_NETWORK, BASE_SEPOLIA_USDC } from './constants.js';
import { canonicalResourceUrl, resolveServiceAuthority, type createEnsClient } from './ens.js';

type EnsClient = ReturnType<typeof createEnsClient>;
interface CatalogResource {
  resource?: unknown;
  description?: unknown;
  serviceName?: unknown;
  accepts?: unknown;
  quality?: { l30DaysTotalCalls?: unknown; l30DaysUniquePayers?: unknown };
}
export interface VerifiedCatalogCandidate {
  serviceName: string;
  resourceUrl: string;
  catalogName: string;
  priceAtomic: bigint;
  payTo: `0x${string}`;
  calls30Days: number | null;
  uniquePayers30Days: number | null;
}

function ensHint(description: unknown): string | null {
  if (typeof description !== 'string') return null;
  const match = /\bENS service:\s*([a-z0-9.-]+\.eth)\b/i.exec(description);
  if (!match?.[1]) return null;
  try { return normalize(match[1]); } catch { return null; }
}
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Bazaar is a candidate source. Each returned name and payee is checked against ENS before ranking. */
export async function discoverVerifiedServices(query: string, ensClient: EnsClient, request: typeof fetch = fetch): Promise<VerifiedCatalogCandidate[]> {
  const url = new URL('https://api.cdp.coinbase.com/platform/v2/x402/discovery/search');
  url.search = new URLSearchParams({ query: query.slice(0, 100), network: BASE_SEPOLIA_NETWORK, limit: '20' }).toString();
  const response = await request(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Bazaar search failed with HTTP ${response.status}`);
  const body = await response.json() as { resources?: unknown };
  if (!Array.isArray(body.resources)) throw new Error('Bazaar response has no resources array');
  const candidates = await Promise.all(body.resources.slice(0, 20).map(async (item: CatalogResource): Promise<VerifiedCatalogCandidate | null> => {
    const name = ensHint(item.description);
    if (!name || typeof item.resource !== 'string' || !Array.isArray(item.accepts)) return null;
    let resourceUrl: string;
    try { resourceUrl = canonicalResourceUrl(item.resource); } catch { return null; }
    try {
      const authority = await resolveServiceAuthority(ensClient, name);
      if (authority.endpoint !== resourceUrl) return null;
      const matching = item.accepts.find((accept: unknown) => {
        if (!accept || typeof accept !== 'object') return false;
        const value = accept as Record<string, unknown>;
        return value.scheme === 'exact' && value.network === BASE_SEPOLIA_NETWORK &&
          typeof value.asset === 'string' && isAddress(value.asset) && getAddress(value.asset) === getAddress(BASE_SEPOLIA_USDC) &&
          typeof value.payTo === 'string' && isAddress(value.payTo) && getAddress(value.payTo) === authority.payTo &&
          typeof value.amount === 'string' && /^[1-9][0-9]{0,19}$/.test(value.amount);
      }) as { amount: string } | undefined;
      if (!matching) return null;
      return {
        serviceName: authority.name, resourceUrl, payTo: authority.payTo,
        catalogName: typeof item.serviceName === 'string' ? item.serviceName : authority.name,
        priceAtomic: BigInt(matching.amount),
        calls30Days: count(item.quality?.l30DaysTotalCalls),
        uniquePayers30Days: count(item.quality?.l30DaysUniquePayers),
      };
    } catch { return null; }
  }));
  return candidates.filter((candidate): candidate is VerifiedCatalogCandidate => candidate !== null)
    .sort((a, b) => a.priceAtomic < b.priceAtomic ? -1 : a.priceAtomic > b.priceAtomic ? 1 :
      (b.uniquePayers30Days ?? 0) - (a.uniquePayers30Days ?? 0));
}
