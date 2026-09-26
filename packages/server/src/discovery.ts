import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseDiscoveryQuery, validateDiscoveryService, validateDiscoverySource, validateDiscoveryCheckpoint, type DiscoveryQuery, type DiscoveryResponse, type DiscoveryService } from "@ens402/sdk/discovery";

export type Embedding = { model: string; contentHash: string; vector: number[] };
export type Catalog = { checkpoint?: DiscoveryResponse["checkpoint"]; source: DiscoveryResponse["source"]; services: Array<{ service: DiscoveryService; embedding?: Embedding }> };
/** Operators provide their own trusted ingestion source. A snapshot is not a live indexer. */
export interface CatalogSource { load(query?: DiscoveryQuery): Promise<Catalog> }
export interface EmbeddingProvider { model: string; embed(text: string): Promise<number[]> }
export const discoveryContent = (service: DiscoveryService) => `${service.name}\n${service.description}`;
export const discoveryContentHash = (service: DiscoveryService) => createHash("sha256").update(discoveryContent(service)).digest("hex");
/** Lexical evidence uses complete Unicode words, not arbitrary substrings. */
const englishStopwords = new Set("a an the i me my we our you your he she it its they their is am are was were be been being do does did will would can could shall should may might have has had to of in on at for from with by and or but if that this these those how what when where who why into".split(" "));
const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });
export function discoveryTerms(text: string): string[] {
  const words = (text.normalize("NFC").toLowerCase().match(/[\p{L}\p{N}\p{M}]+/gu) ?? [])
    .flatMap(part => [...wordSegmenter.segment(part)].filter(segment => segment.isWordLike).map(segment => segment.segment));
  return [...new Set(words.filter(word => !englishStopwords.has(word)))];
}
function vectorValid(vector: number[]) { return Array.isArray(vector) && vector.length > 0 && vector.length <= 8192 && vector.every(Number.isFinite) && vector.some(value => value !== 0); }
function cosine(a: number[], b: number[]): number {
  if (!vectorValid(a) || !vectorValid(b) || a.length !== b.length) throw new Error("Invalid embedding dimensions");
  const unit = (vector: number[]) => {
    const scale = Math.max(...vector.map(Math.abs));
    const scaled = vector.map(value => value / scale);
    const norm = Math.hypot(...scaled);
    return scaled.map(value => value / norm);
  };
  const left = unit(a), right = unit(b);
  return Math.max(-1, Math.min(1, left.reduce((sum, value, i) => sum + value * right[i]!, 0)));
}
/** Refresh embeddings whenever metadata changes; ingestion must also remove deleted rows. */
export async function embedDiscoveryService(service: DiscoveryService, provider: EmbeddingProvider): Promise<Embedding> {
  validateDiscoveryService(service);
  const vector = await provider.embed(discoveryContent(service));
  if (!vectorValid(vector)) throw new Error("Invalid embedding response");
  return { model: provider.model, contentHash: discoveryContentHash(service), vector };
}
export async function searchDiscovery(input: DiscoveryQuery, options: { source: CatalogSource; embeddings?: EmbeddingProvider; now?: number; maxAgeSeconds?: number; minSemanticSimilarity?: number }): Promise<DiscoveryResponse> {
  const query = parseDiscoveryQuery(input);
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const maxAge = options.maxAgeSeconds ?? 3600;
  // Cosine scores are model-dependent. Rank positive nearest candidates by default;
  // operators may supply a threshold after evaluating their own model and corpus.
  const minimumSimilarity = options.minSemanticSimilarity ?? 0;
  if (!Number.isFinite(minimumSimilarity) || minimumSimilarity < 0 || minimumSimilarity > 1) throw new Error("Invalid semantic similarity threshold");
  const catalog = await options.source.load(query);
  validateDiscoverySource(catalog?.source, now, maxAge);
  validateDiscoveryCheckpoint(catalog.checkpoint, catalog.source.kind);
  if (!Array.isArray(catalog.services) || catalog.services.length > 10_000) throw new Error("Discovery catalog unavailable or stale");
  const names = new Set<string>();
  for (const row of catalog.services) {
    validateDiscoveryService(row.service);
    if (catalog.checkpoint && BigInt(row.service.indexedBlock) > BigInt(catalog.checkpoint.blockNumber)) throw new Error("Service block exceeds catalog checkpoint");
    if (names.has(row.service.name) || !catalog.source.roots.some(root => row.service.name.endsWith(`.${root}`))) throw new Error("Catalog identity or root mismatch");
    names.add(row.service.name);
  }
  let vector: number[] | undefined;
  let semantic: DiscoveryResponse["semantic"] = query.mode === "hybrid" && query.query ? "unavailable" : "not-requested";
  if (semantic === "unavailable" && options.embeddings) {
    try { const embedded = await options.embeddings.embed(query.query); if (vectorValid(embedded)) vector = embedded; } catch { /* Explicit keyword fallback, never synthesize embeddings. */ }
  }
  const terms = discoveryTerms(query.query);
  const results: DiscoveryResponse["results"] = [];
  for (const { service, embedding } of catalog.services) {
    if (service.status !== "active" || service.expiresAt <= now || service.indexedAt > catalog.source.updatedAt || service.indexedAt > now || now - service.indexedAt > maxAge || service.paymentNetwork !== query.paymentNetwork || service.assetAddress.toLowerCase() !== query.assetAddress || (query.maxPricePerRequestAtomic !== undefined && BigInt(service.pricePerRequestAtomic) > BigInt(query.maxPricePerRequestAtomic))) continue;
    const match: DiscoveryResponse["results"][number]["match"] = [];
    let score = 0;
    if (query.query.toLowerCase() === service.name) { score += 10; match.push("name"); }
    const content = discoveryContent(service).normalize("NFC").toLowerCase();
    const words = new Set(discoveryTerms(content));
    // CJK dictionary segmentation can combine a query word into a larger compound.
    // Allow a multi-character CJK phrase inside that compound, never Latin substrings.
    const hits = terms.filter(term => words.has(term) || (Array.from(term).length >= 2 && /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+$/u.test(term) && content.includes(term))).length;
    if (hits) { score += hits / terms.length; match.push("keyword"); }
    if (vector && embedding && embedding.model === options.embeddings?.model && embedding.contentHash === discoveryContentHash(service)) {
      try { const similarity = cosine(vector, embedding.vector); semantic = "used"; if (similarity > minimumSimilarity) { score += similarity; match.push("semantic"); } } catch { /* Invalid or stale embeddings are excluded from semantic ranking. */ }
    }
    if (!query.query || score > 0) results.push({ service, score, match });
  }
  results.sort((a, b) => b.score - a.score || a.service.name.localeCompare(b.service.name));
  return { results: results.slice(0, query.pageSize), source: catalog.source, ...(catalog.checkpoint ? { checkpoint: catalog.checkpoint } : {}), semantic, requiresFreshResolution: true };
}
/** Local snapshot adapter for development or operator exports; never reads account/payment tables. */
export class JsonCatalogSource implements CatalogSource {
  constructor(private readonly path: string) {}
  async load(): Promise<Catalog> {
    const raw = await readFile(this.path, "utf8");
    if (Buffer.byteLength(raw) > 10_000_000) throw new Error("Catalog too large");
    return JSON.parse(raw) as Catalog;
  }
}

/** Explicit operator-selected OpenAI-compatible embedding transport. Credentials remain server-side. */
export class HttpEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  constructor(private readonly options: { endpoint: string; apiKey: string; model: string; fetch?: typeof fetch }) {
    const url = new URL(options.endpoint);
    if (url.protocol !== "https:" || url.username || url.password || !options.apiKey || !options.model) throw new Error("Invalid embedding provider configuration");
    this.model = options.model;
  }
  async embed(text: string): Promise<number[]> {
    if (!text || text.length > 4096) throw new Error("Invalid embedding input");
    const response = await (this.options.fetch ?? fetch)(this.options.endpoint, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.options.apiKey}` },
      body: JSON.stringify({ model: this.model, input: text, encoding_format: "float" }),
    });
    if (!response.ok) throw new Error("Embedding provider unavailable");
    const result = await response.json() as { model?: string; data?: Array<{ embedding: number[] }> };
    if (result.model !== this.model || result.data?.length !== 1 || !vectorValid(result.data[0]!.embedding)) throw new Error("Invalid embedding response");
    return result.data[0]!.embedding;
  }
}
