import { describe, it, expect, vi } from "vitest";
import { OpenAiDiscoveryRelevance } from "../src/discovery-relevance";
import { searchDiscovery, discoveryContentHash } from "../src/discovery";
import { NETWORK, USDC } from "@ens402/sdk";
import type { DiscoveryService } from "@ens402/sdk/discovery";
const service: DiscoveryService = { name: "weather.demo.ens402.eth", description: "Demo fixture: Tokyo weather forecast", endpoint: "https://example.com/weather", paymentNetwork: NETWORK, assetAddress: USDC, assetDecimals: 6, pricePerRequestAtomic: "10000", payTo: `0x${"1".repeat(40)}`, indexedBlock: "1", indexedAt: 990, expiresAt: 2000, status: "active", fixture: true, call: { method: "GET" } };
function options(similarity: number) {
  return { now: 1000, source: { load: async () => ({ source: { id: "test", kind: "snapshot" as const, roots: ["ens402.eth"], updatedAt: 990 }, services: [{ service, embedding: { model: "test", contentHash: discoveryContentHash(service), vector: [similarity, Math.sqrt(1 - similarity ** 2)] } }] }) }, embeddings: { model: "test", embed: async () => [1, 0] } };
}
describe("semantic relevance boundary", () => {
  it("does not recommend a weak nearest candidate for eat", async () => {
    const relevance = { select: vi.fn(async () => [service.name]) };
    expect((await searchDiscovery({ query: "eat" }, { ...options(0.144), relevance })).results).toEqual([]);
    expect(relevance.select).not.toHaveBeenCalled();
  });
  it("can reject test at 0.317 while accepting umbrella at 0.252", async () => {
    expect((await searchDiscovery({ query: "test" }, { ...options(0.317), relevance: { select: async () => [] } })).results).toEqual([]);
    const result = await searchDiscovery({ query: "Will I need an umbrella tomorrow?" }, { ...options(0.252), relevance: { select: async () => [service.name] } });
    expect(result.results.map(row => row.service.name)).toEqual([service.name]);
  });
  it("fails to keyword results on relevance timeout without inventing a match", async () => {
    const relevance = { select: async () => { throw new Error("timeout"); } };
    const empty = await searchDiscovery({ query: "test" }, { ...options(0.8), relevance });
    expect(empty.results).toEqual([]); expect(empty.semantic).toBe("unavailable");
    expect((await searchDiscovery({ query: "weather" }, { ...options(0.8), relevance })).results).toHaveLength(1);
    expect((await searchDiscovery({}, { ...options(0.8), relevance })).results).toHaveLength(1);
  });
  it("uses strict structured output, caches decisions and invalidates changed descriptions", async () => {
    const budget = vi.fn(async () => {});
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.response_format.json_schema.strict).toBe(true);
      expect(JSON.parse(body.messages[1].content).candidates[0].description).toBeTruthy();
      return Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"ids":[0]}' } }] });
    });
    const gate = new OpenAiDiscoveryRelevance({ apiKey: "fixture", beforeRequest: budget, fetch: fetcher });
    expect(await gate.select("umbrella", [service])).toEqual([service.name]);
    await gate.select("umbrella", [service]);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(budget).toHaveBeenCalledTimes(1);
    await gate.select("umbrella", [{ ...service, description: "Updated weather data" }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(['{"ids":[9]}', '{"ids":[0,0]}', '{"ids":["0"]}', 'invalid'])('rejects malformed selection %s', async content => {
    const gate = new OpenAiDiscoveryRelevance({ apiKey: "fixture", beforeRequest: async () => {}, fetch: async () => Response.json({ choices: [{ finish_reason: "stop", message: { content } }] }) });
    await expect(gate.select("umbrella", [service])).rejects.toThrow();
  });
});
