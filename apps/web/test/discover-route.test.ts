import { beforeEach, expect, it, vi } from "vitest";
const { search, load, refresh, background } = vi.hoisted(() => ({ search: vi.fn(), load: vi.fn(), refresh: vi.fn(), background: vi.fn() }));
vi.mock("next/server", () => ({ after: background }));
vi.mock("../../../indexer/src/refresh", () => ({ refreshConfiguredCatalog: refresh }));
vi.mock("@ens402/server/discovery-runtime", () => ({ configuredDiscovery: () => ({ source: { load } }) }));
vi.mock("@ens402/server/discovery", async importOriginal => ({ ...await importOriginal<typeof import("@ens402/server/discovery")>(), searchDiscovery: search }));
import { DiscoveryNotReadyError } from "@ens402/server/discovery";
import { discover, DiscoveryApiError } from "@ens402/sdk/discovery";
import { GET } from "../src/app/api/discover/route";
beforeEach(() => vi.clearAllMocks());
it("distinguishes an unsynchronized catalog through the API and SDK", async () => {
  search.mockRejectedValue(new DiscoveryNotReadyError());
  const response = await GET(new Request("https://example.com/api/discover?query=weather"));
  expect(response.status).toBe(503);
  expect((await response.clone().json()).code).toBe("CATALOG_NOT_READY");
  await expect(discover({}, { apiUrl: "https://example.com/api/discover", fetch: async () => response })).rejects.toMatchObject({ code: "CATALOG_NOT_READY", status: 503 });
});
it("does not expose internal database errors or mislabel outages as setup", async () => {
  search.mockRejectedValue(new Error("private database details"));
  const response = await GET(new Request("https://example.com/api/discover"));
  expect(await response.clone().json()).toEqual({ code: "CATALOG_UNAVAILABLE", error: "Discovery catalog unavailable or stale." });
  await expect(discover({}, { apiUrl: "https://example.com/api/discover", fetch: async () => response })).rejects.toBeInstanceOf(DiscoveryApiError);
});
it("preserves HTTP errors when upstream sends malformed JSON", async () => {
  await expect(discover({}, { apiUrl: "https://example.com/api/discover", fetch: async () => new Response("unavailable", { status: 503 }) })).rejects.toMatchObject({ status: 503, code: undefined });
});

it("refreshes an aging catalog after responding without delaying fresh search", async () => {
  load.mockResolvedValue({source:{updatedAt:Math.floor(Date.now()/1000)-1300}});
  search.mockImplementationOnce(async (query, options) => { await options.source.load(query); return {results:[]}; });
  const response=await GET(new Request("https://example.com/api/discover"));
  expect(response.status).toBe(200);
  expect(background).toHaveBeenCalledOnce();
  await background.mock.calls[0]![0]();
  expect(refresh).toHaveBeenCalledOnce();
});
it("reports a rebuilding expired catalog without serving stale results", async () => {
  load.mockResolvedValue({source:{updatedAt:Math.floor(Date.now()/1000)-4000}});
  search.mockImplementationOnce(async (query, options) => { await options.source.load(query); throw Error("expired"); });
  const response=await GET(new Request("https://example.com/api/discover"));
  expect(response.status).toBe(503);
  expect(response.headers.get("Retry-After")).toBe("5");
  await expect(discover({}, {apiUrl:"https://example.com/api/discover",fetch:async()=>response})).rejects.toMatchObject({code:"CATALOG_REFRESHING"});
});
