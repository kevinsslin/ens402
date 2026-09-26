import { describe, expect, it } from "vitest";
import { discover, type DiscoveryResponse } from "../src/discovery";
import { NETWORK, USDC } from "../src/index";
const result = (): DiscoveryResponse => ({ source: { id: "test", roots: ["ens402.eth"], updatedAt: 1000, kind: "snapshot" }, semantic: "unavailable", requiresFreshResolution: true, results: [{ score: 1, match: ["keyword"], service: { name: "weather.demo.ens402.eth", description: "Weather", endpoint: "https://example.com/weather", paymentNetwork: NETWORK, assetAddress: USDC, pricePerRequestAtomic: "1", assetDecimals: 6, payTo: `0x${"1".repeat(40)}`, indexedBlock: "100", indexedAt: 1000, expiresAt: 2000, status: "active", fixture: true, call: { method: "GET" } } }] });
const query = (data: unknown) => discover({ query: "weather" }, { apiUrl: "https://example.com/api/discover", now: 1001, maxAgeSeconds: 60, expectedRoots: ["ens402.eth"], fetch: async () => Response.json(data) });
describe("untrusted discovery API boundary", () => {
  it("accepts a current candidate under approved roots", async () => { expect((await query(result())).results).toHaveLength(1); });
  it("rejects duplicates and names outside declared roots", async () => {
    const duplicate = result(); duplicate.results.push(duplicate.results[0]!); await expect(query(duplicate)).rejects.toThrow("Duplicate");
    const outside = result(); outside.results[0]!.service.name = "weather.other.eth"; await expect(query(outside)).rejects.toThrow("outside source");
  });
  it("rejects stale/future catalogs and expired/stale services", async () => {
    for (const timestamp of [900, 2000]) { const data = result(); data.source.updatedAt = timestamp; await expect(query(data)).rejects.toThrow("stale"); }
    for (const change of [{ expiresAt: 1000 }, { indexedAt: 900 }, { indexedAt: 1001 }]) { const data = result(); Object.assign(data.results[0]!.service, change); await expect(query(data)).rejects.toThrow("stale"); }
  });
  it("rejects undeclared trust roots and fake semantic evidence", async () => {
    const data = result(); data.source.roots = ["other.eth"]; await expect(query(data)).rejects.toThrow("approved roots");
    const fake = result(); fake.results[0]!.match = ["semantic"]; await expect(query(fake)).rejects.toThrow("semantic evidence");
  });
  it("requires chain checkpoint evidence for an indexer source", async () => {
    const data = result(); data.source.kind = "indexer"; await expect(query(data)).rejects.toThrow("checkpoint");
  });
  it("limits the untrusted response before JSON parsing", async () => {
    await expect(discover({}, { apiUrl: "https://example.com", fetch: async () => new Response(" ".repeat(2_000_001)) })).rejects.toThrow("too large");
  });
});
