import { parseCallMetadata, type CallMetadata } from "./call";
import { normalize } from "viem/ens";
import { NETWORK, USDC, addressPattern, validAmount } from "./index";

/** Search is candidate selection, never a replacement for fresh ENS resolution and Guard. */
export type DiscoveryQuery = {
  query?: string;
  paymentNetwork?: string;
  assetAddress?: string;
  maxPricePerRequestAtomic?: string;
  pageSize?: number;
  mode?: "keyword" | "hybrid";
};
export type DiscoveryService = {
  name: string;
  description: string;
  endpoint: string;
  paymentNetwork: string;
  assetAddress: string;
  pricePerRequestAtomic: string;
  assetDecimals: number;
  payTo: string;
  indexedBlock: string;
  indexedAt: number;
  expiresAt: number;
  status: "active" | "suspended" | "deleted";
  fixture: boolean;
  call: CallMetadata;
};
/** Scores describe query relevance only, not service trust, quality or payment approval. */
export type DiscoveryCheckpoint = { chainId: 11155111; fromBlock: string; blockNumber: string; blockHash: string; rawScope?: string };
export type DiscoveryResponse = {
  checkpoint?: DiscoveryCheckpoint;
  results: Array<{ service: DiscoveryService; match: Array<"name" | "keyword" | "semantic">; score: number }>;
  source: { id: string; roots: string[]; updatedAt: number; kind: "snapshot" | "indexer" };
  semantic: "used" | "unavailable" | "not-requested";
  requiresFreshResolution: true;
};
export function parseDiscoveryQuery(input: DiscoveryQuery): Required<Omit<DiscoveryQuery, "maxPricePerRequestAtomic">> & Pick<DiscoveryQuery, "maxPricePerRequestAtomic"> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid discovery query");
  const query = input.query ?? "";
  const paymentNetwork = input.paymentNetwork ?? NETWORK;
  const assetAddress = input.assetAddress ?? USDC;
  const pageSize = input.pageSize ?? 20;
  const mode = input.mode ?? "hybrid";
  if (typeof query !== "string" || query.length > 500 || paymentNetwork !== NETWORK || !addressPattern.test(assetAddress) || assetAddress.toLowerCase() !== USDC || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 || !["keyword", "hybrid"].includes(mode)) throw new Error("Invalid discovery filters");
  if (input.maxPricePerRequestAtomic !== undefined && !validAmount(input.maxPricePerRequestAtomic)) throw new Error("Price must be an unsigned atomic-unit integer");
  return { query: query.trim(), paymentNetwork, assetAddress: assetAddress.toLowerCase(), pageSize, mode, maxPricePerRequestAtomic: input.maxPricePerRequestAtomic };
}
/** Query any compatible operator. No platform wallet or credentials are required. */
/** Stable, optional availability code; remote error text is never trusted. */
export class DiscoveryApiError extends Error {
  constructor(public readonly status: number, public readonly code?: "CATALOG_NOT_READY" | "CATALOG_REFRESHING") {
    super(`Discovery API unavailable (${status})`);
    this.name = "DiscoveryApiError";
  }
}
export async function discover(input: DiscoveryQuery, options: { apiUrl: string; fetch?: typeof fetch; now?: number; maxAgeSeconds?: number; expectedRoots?: string[] }): Promise<DiscoveryResponse> {
  const query = parseDiscoveryQuery(input);
  const url = new URL(options.apiUrl);
  if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("Use an HTTPS discovery API URL");
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
  const response = await (options.fetch ?? fetch)(url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  if (!response.ok) {
    let code: "CATALOG_NOT_READY" | "CATALOG_REFRESHING" | undefined;
    if (response.status === 503) {
      try { const received = (await boundedDiscoveryJson(response) as { code?: unknown } | null)?.code; if (received === "CATALOG_NOT_READY" || received === "CATALOG_REFRESHING") code = received; } catch { /* Preserve the HTTP error for malformed responses. */ }
    }
    throw new DiscoveryApiError(response.status, code);
  }
  const result = await boundedDiscoveryJson(response) as DiscoveryResponse;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const maxAge = options.maxAgeSeconds ?? 3600;
  if (!result || !Array.isArray(result.results) || result.results.length > query.pageSize || result.requiresFreshResolution !== true || !result.source || !["used", "unavailable", "not-requested"].includes(result.semantic)) throw new Error("Invalid discovery response");
  validateDiscoverySource(result.source, now, maxAge);
  validateDiscoveryCheckpoint(result.checkpoint, result.source.kind);
  if ((query.mode === "keyword" || !query.query) && result.semantic === "used") throw new Error("Unexpected semantic search result");
  if (options.expectedRoots && (!options.expectedRoots.length || result.source.roots.some(root => !options.expectedRoots!.includes(root)))) throw new Error("Discovery source is outside approved roots");
  const names = new Set<string>();
  for (const row of result.results) {
    if (!row || typeof row !== "object") throw new Error("Invalid discovery result");
    validateDiscoveryService(row.service);
    if (result.checkpoint && BigInt(row.service.indexedBlock) > BigInt(result.checkpoint.blockNumber)) throw new Error("Service block exceeds catalog checkpoint");
    if (names.has(row.service.name)) throw new Error("Duplicate discovery service");
    names.add(row.service.name);
    if (!result.source.roots.some(root => row.service.name.endsWith(`.${root}`))) throw new Error("Discovery service is outside source roots");
    if (row.service.indexedAt > result.source.updatedAt || row.service.indexedAt > now || now - row.service.indexedAt > maxAge || row.service.expiresAt <= now) throw new Error("Discovery service is stale or expired");
    if (!Number.isFinite(row.score) || row.score < 0 || !Array.isArray(row.match) || row.match.some(reason => !["name", "keyword", "semantic"].includes(reason))) throw new Error("Invalid discovery ranking");
    if (row.match.includes("semantic") && result.semantic !== "used") throw new Error("Invalid semantic evidence");
    if (row.service.status !== "active" || row.service.paymentNetwork !== query.paymentNetwork || row.service.assetAddress.toLowerCase() !== query.assetAddress || (query.maxPricePerRequestAtomic !== undefined && BigInt(row.service.pricePerRequestAtomic) > BigInt(query.maxPricePerRequestAtomic))) throw new Error("Discovery response violates requested filters");
  }
  return result;
}
export function validateDiscoveryService(service: DiscoveryService): void {
  if (!service || typeof service.name !== "string" || !validDiscoveryName(service.name) || service.name.length > 255 || typeof service.description !== "string" || new TextEncoder().encode(service.description).length > 1024 || service.paymentNetwork !== NETWORK || typeof service.assetAddress !== "string" || service.assetAddress.toLowerCase() !== USDC || service.assetDecimals !== 6 || !addressPattern.test(service.payTo) || !validAmount(service.pricePerRequestAtomic) || BigInt(service.pricePerRequestAtomic) === 0n || (typeof service.indexedBlock !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(service.indexedBlock)) || !Number.isSafeInteger(service.indexedAt) || service.indexedAt < 0 || !Number.isSafeInteger(service.expiresAt) || service.expiresAt < 0 || !["active", "suspended", "deleted"].includes(service.status) || typeof service.fixture !== "boolean" || !service.call || !["GET", "POST"].includes(service.call.method)) throw new Error("Invalid discovery service");
  const endpoint = new URL(service.endpoint);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash) throw new Error("Invalid discovery endpoint");
  parseCallMetadata(JSON.stringify(service.call));
  for (const value of [service.call.inputSchema, service.call.example]) if (value !== undefined && (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(value).length > 16_384)) throw new Error("Invalid call metadata");
}

function validDiscoveryName(name: string): boolean {
  try { return name.length <= 255 && name.endsWith(".eth") && normalize(name) === name; } catch { return false; }
}
export function validateDiscoverySource(source: DiscoveryResponse["source"], now: number, maxAgeSeconds: number): void {
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1 || maxAgeSeconds > 86400) throw new Error("Invalid discovery freshness policy");
  if (!source || typeof source.id !== "string" || !source.id || source.id.length > 255 || !Array.isArray(source.roots) || !source.roots.length || source.roots.length > 100 || source.roots.some(root => typeof root !== "string" || !validDiscoveryName(root)) || new Set(source.roots).size !== source.roots.length || !["snapshot", "indexer"].includes(source.kind) || !Number.isSafeInteger(source.updatedAt) || source.updatedAt < 0 || source.updatedAt > now || now - source.updatedAt > maxAgeSeconds) throw new Error("Discovery catalog unavailable or stale");
}
async function boundedDiscoveryJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing discovery response body");
  let text = "", size = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) throw new Error("Discovery response too large");
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally { await reader.cancel().catch(() => {}); }
}

export function validateDiscoveryCheckpoint(checkpoint: DiscoveryCheckpoint | undefined, kind: DiscoveryResponse["source"]["kind"]): void {
  if (checkpoint === undefined && kind === "snapshot") return;
  if (!checkpoint || checkpoint.chainId !== 11155111 || typeof checkpoint.fromBlock !== "string" || typeof checkpoint.blockNumber !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(checkpoint.fromBlock) || !/^(0|[1-9][0-9]{0,77})$/.test(checkpoint.blockNumber) || BigInt(checkpoint.fromBlock) > BigInt(checkpoint.blockNumber) || typeof checkpoint.blockHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(checkpoint.blockHash) || (checkpoint.rawScope !== undefined && (typeof checkpoint.rawScope !== "string" || checkpoint.rawScope.length > 500))) throw new Error("Invalid discovery checkpoint");
}
