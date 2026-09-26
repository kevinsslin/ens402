import { afterEach, describe, expect, it, vi } from "vitest";
import { journalCandidates } from "./journal";
afterEach(() => vi.unstubAllGlobals());
describe("Envio journal completeness gate", () => {
  it("rejects an indexer behind the requested snapshot instead of exporting a partial catalog", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ data: { IndexedHead_by_pk: { blockNumber: "9" } } })));
    await expect(journalCandidates("http://localhost:8080/v1/graphql", 10n)).rejects.toThrow("not indexed");
  });
  it("preserves registered labels as candidates for authoritative state reads", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: { IndexedHead_by_pk: { blockNumber: "10" } } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { NativeEvent: [{ id: "1", contract: "0xABC", params: '{"label":"weather"}' }] } })));
    vi.stubGlobal("fetch", fetcher);
    expect(await journalCandidates("http://localhost:8080/v1/graphql", 10n)).toEqual({ "0xabc": ["weather"] });
  });
});
