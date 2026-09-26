import { beforeEach, expect, it, vi } from "vitest";
const { search } = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock("@ens402/server/discovery-runtime", () => ({ configuredDiscovery: () => ({}) }));
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
