import { describe, it, expect } from "vitest";
import { NETWORK, USDC } from "@ens402/sdk";
import { discover, parseDiscoveryQuery, type DiscoveryService } from "@ens402/sdk/discovery";
import { searchDiscovery, discoveryContentHash, HttpEmbeddingProvider, type Catalog } from "../src/discovery";
const service: DiscoveryService = {
  name: "weather.dataco.ens402.eth", description: "Weather forecasts by city", endpoint: "https://example.com/weather",
  paymentNetwork: NETWORK, assetAddress: USDC, pricePerRequestAtomic: "9007199254740993", assetDecimals: 6,
  payTo: `0x${"1".repeat(40)}`, indexedBlock: "123", indexedAt: 990, expiresAt: 2000, status: "active", fixture: true, call: { method: "GET" },
};
function options(rows: Catalog["services"] = [{ service }]) { return { now: 1000, source: { load: async (): Promise<Catalog> => ({ source: { id: "test", roots: ["ens402.eth"], kind: "snapshot", updatedAt: 990 }, services: rows }) } }; }
describe("discovery candidate boundary", () => {
  it("defaults to Base Sepolia USDC and rejects ambiguous numeric prices", () => {
    expect(parseDiscoveryQuery({}).assetAddress).toBe(USDC);
    for (const amount of ["1.2", "-1", "01", "1e6"]) expect(() => parseDiscoveryQuery({ maxPricePerRequestAtomic: amount })).toThrow();
  });
  it("compares atomic prices without precision loss", async () => {
    expect((await searchDiscovery({ maxPricePerRequestAtomic: "9007199254740992" }, options())).results).toHaveLength(0);
    expect((await searchDiscovery({ maxPricePerRequestAtomic: "9007199254740993" }, options())).results).toHaveLength(1);
  });
  it("ranks exact ENS before description matches and signals unavailable semantics", async () => {
    const other = { ...service, name: "research.dataco.ens402.eth", description: service.name };
    const result = await searchDiscovery({ query: service.name }, options([{ service: other }, { service }]));
    expect(result.results[0]?.service.name).toBe(service.name);
    expect(result.semantic).toBe("unavailable");
    expect(result.requiresFreshResolution).toBe(true);
  });
  it("excludes expired, suspended and stale services", async () => {
    for (const change of [{ expiresAt: 999 }, { status: "suspended" as const }, { indexedAt: 1 }]) {
      expect((await searchDiscovery({}, { ...options([{ service: { ...service, ...change } }]), maxAgeSeconds: 50 })).results).toHaveLength(0);
    }
  });
  it("fails closed on stale catalog, wrong root and duplicate identity", async () => {
    await expect(searchDiscovery({}, { ...options(), now: 10000 })).rejects.toThrow("stale");
    await expect(searchDiscovery({}, options([{ service: { ...service, name: "bad.other.eth" } }]))).rejects.toThrow("root");
    await expect(searchDiscovery({}, options([{ service }, { service }]))).rejects.toThrow("identity");
  });
  it("uses matching embeddings and ignores outdated metadata embeddings", async () => {
    const row = { service, embedding: { model: "test", contentHash: discoveryContentHash(service), vector: [1, 0] } };
    const embeddings = { model: "test", embed: async () => [1, 0] };
    const result = await searchDiscovery({ query: "rain tomorrow" }, { ...options([row]), embeddings });
    expect(result.results[0]?.match).toContain("semantic");
    expect(result.semantic).toBe("used");
    row.service = { ...service, description: "Different content" };
    expect((await searchDiscovery({ query: "rain tomorrow" }, { ...options([row]), embeddings })).semantic).toBe("unavailable");
  });
  it("falls back honestly when embedding transport fails", async () => {
    const result = await searchDiscovery({ query: "weather" }, { ...options(), embeddings: { model: "test", embed: async () => { throw new Error(); } } });
    expect(result.results).toHaveLength(1);
    expect(result.semantic).toBe("unavailable");
  });
  it("calls configured real embedding transport and validates model", async () => {
    const provider = new HttpEmbeddingProvider({ endpoint: "https://example.com/embeddings", apiKey: "fixture", model: "test", fetch: async (_url, init) => {
      expect(JSON.parse(init!.body as string)).toEqual({ model: "test", input: "rain", encoding_format: "float" });
      return Response.json({ model: "test", data: [{ embedding: [1, 0] }] });
    } });
    expect(await provider.embed("rain")).toEqual([1, 0]);
  });
  it("SDK preserves query and refuses filter-violating search responses", async () => {
    const response = await searchDiscovery({}, options());
    await expect(discover({ maxPricePerRequestAtomic: "1" }, { apiUrl: "https://example.com/api/discover", now: 1000, fetch: async url => {
      expect(new URL(String(url)).searchParams.get("maxPricePerRequestAtomic")).toBe("1");
      return Response.json(response);
    } })).rejects.toThrow("filters");
  });
});

it("keeps semantic scores finite for extreme finite embedding magnitudes", async () => {
  const row = { service, embedding: { model: "test", contentHash: discoveryContentHash(service), vector: [1e308, 1e308] } };
  const response = await searchDiscovery({ query: "rain tomorrow" }, { ...options([row]), embeddings: { model: "test", embed: async () => [1e308, 1e308] } });
  expect(response.results[0]?.score).toBeCloseTo(1);
});

it("does not treat tiny words or substrings as lexical evidence", async () => {
  const fx = { ...service, name: "fx.dataco.ens402.eth", description: "Currency foreign exchange rate" };
  const result = await searchDiscovery({ query: "Will I need an umbrella tomorrow?", mode: "keyword" }, options([{ service: fx }, { service }]));
  expect(result.results).toEqual([]);
  expect((await searchDiscovery({ query: "the and I", mode: "keyword" }, options())).results).toEqual([]);
  expect((await searchDiscovery({ query: "cast", mode: "keyword" }, options())).results).toEqual([]);
});
it("excludes weak similarities while preserving stronger semantic candidates", async () => {
  const fx = { ...service, name: "fx.dataco.ens402.eth", description: "Currency foreign exchange rate" };
  const row = (entry: typeof service, similarity: number) => ({ service: entry, embedding: { model: "test", contentHash: discoveryContentHash(entry), vector: [similarity, Math.sqrt(1 - similarity ** 2)] } });
  const source = options([row(fx, 0.06), row(service, 0.26)]);
  const embeddings = { model: "test", embed: async () => [1, 0] };
  const result = await searchDiscovery({ query: "Will I need an umbrella tomorrow?" }, { ...source, embeddings });
  expect(result.results[0]?.service.name).toBe(service.name);
  expect(result.results).toHaveLength(1);
  expect(result.results.every(entry => !entry.match.includes("keyword"))).toBe(true);
  expect((await searchDiscovery({ query: "umbrella" }, { ...source, embeddings, minSemanticSimilarity: 0.3 })).results).toEqual([]);
});
it("preserves Unicode word evidence and strips query punctuation", async () => {
  const chinese = { ...service, description: "提供東京天氣預報服務" };
  expect((await searchDiscovery({ query: "天氣", mode: "keyword" }, options([{ service: chinese }]))).results).toHaveLength(1);
  expect((await searchDiscovery({ query: "weather?", mode: "keyword" }, options())).results).toHaveLength(1);
});
