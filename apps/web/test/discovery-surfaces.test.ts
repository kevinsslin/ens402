import { beforeEach, describe, expect, it, vi } from "vitest";
const { inspect, search, activity, merchant } = vi.hoisted(() => ({ inspect: vi.fn(), search: vi.fn(), activity: vi.fn(), merchant: vi.fn() }));
vi.mock("@ens402/server", () => ({ inspectService: inspect }));
vi.mock("../src/app/api/discover/route", () => ({ GET: search }));
vi.mock("../src/app/api/governance/activity/route", () => ({ GET: activity }));
vi.mock("@ens402/server/merchant", () => ({ serveMerchant: merchant }));
import { POST } from "../src/app/api/mcp/route";
import { GET as fixture } from "../src/app/api/merchant/fixtures/[service]/route";
function rpc(method: string, params?: unknown, headers?: Record<string, string>) {
  return POST(new Request("https://example.com/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
}
beforeEach(() => { vi.clearAllMocks(); });
describe("read-only MCP", () => {
  it("initializes and exposes only read tools", async () => {
    expect((await (await rpc("initialize")).json()).result.capabilities.tools).toBeDefined();
    const tools = (await (await rpc("tools/list")).json()).result.tools;
    expect(tools.map((tool: { name: string }) => tool.name)).toEqual(["discover_services", "resolve_service", "observe_ens_changes"]);
    expect(tools.every((tool: { annotations: { readOnlyHint: boolean } }) => tool.annotations.readOnlyHint)).toBe(true);
  });
  it("uses the same discovery route and rejects unknown fields", async () => {
    search.mockResolvedValue(Response.json({ results: [], requiresFreshResolution: true }));
    const result = await (await rpc("tools/call", { name: "discover_services", arguments: { query: "weather", maxPricePerRequestAtomic: "10000" } })).json();
    expect(result.result.isError).toBe(false);
    expect(new URL(search.mock.calls[0]![0].url).searchParams.get("query")).toBe("weather");
    expect((await (await rpc("tools/call", { name: "discover_services", arguments: { pay: true } })).json()).error.code).toBe(-32602);
  });
  it("enforces MCP argument types before calling discovery", async () => {
    for (const args of [{ pageSize: "2" }, { query: 1 }, { mode: 2 }, { maxPricePerRequestAtomic: 10000 }]) {
      expect((await (await rpc("tools/call", { name: "discover_services", arguments: args })).json()).error.code).toBe(-32602);
    }
    expect(search).not.toHaveBeenCalled();
  });
  it("freshly resolves only a valid ENS name", async () => {
    inspect.mockResolvedValue({ name: "weather.provider.eth", amount: 10000n });
    const result = await (await rpc("tools/call", { name: "resolve_service", arguments: { name: "weather.provider.eth" } })).json();
    expect(result.result.content[0].text).toContain('"10000"');
    expect(inspect).toHaveBeenCalledWith("weather.provider.eth");
    expect((await (await rpc("tools/call", { name: "resolve_service", arguments: { name: "https://evil.example" } })).json()).error.code).toBe(-32602);
  });
  it("exposes bounded indexed ENS observations without payment authority", async () => {
    activity.mockResolvedValue(Response.json({ source: "Curvegrid MultiBaas", authority: "observation_only", events: [] }));
    const result = await (await rpc("tools/call", { name: "observe_ens_changes", arguments: { kind: "Registry", limit: 5 } })).json();
    expect(result.result.isError).toBe(false);
    expect(result.result.content[0].text).toContain("observation_only");
    expect(new URL(activity.mock.calls[0]![0].url).searchParams.get("limit")).toBe("5");
    expect((await (await rpc("tools/call", { name: "observe_ens_changes", arguments: { limit: 1000 } })).json()).error.code).toBe(-32602);
  });
  it("rejects browser cross-origin use and handles upstream unavailability without payments", async () => {
    expect((await rpc("tools/list", undefined, { Origin: "https://evil.example" })).status).toBe(403);
    search.mockResolvedValue(Response.json({}, { status: 503 }));
    expect((await (await rpc("tools/call", { name: "discover_services" })).json()).result.isError).toBe(true);
    expect(merchant).not.toHaveBeenCalled();
  });
});
describe("callable x402 fixtures", () => {
  it.each(["weather", "fx", "research"])("routes %s through verified merchant delivery", async service => {
    vi.stubEnv("MERCHANT_RESOURCE_URL", "https://example.com/api/merchant/search");
    merchant.mockImplementation(async (_req, _version, resource) => Response.json(await resource.deliver({})));
    const result = await fixture(new Request(`https://example.com/api/merchant/fixtures/${service}`), { params: Promise.resolve({ service }) });
    expect((await result.json()).fixture).toBe(true);
    expect(merchant.mock.calls[0]![2].url).toBe(`https://example.com/api/merchant/fixtures/${service}`);
    vi.unstubAllEnvs();
  });
  it("rejects unknown services without invoking settlement", async () => {
    expect((await fixture(new Request("https://example.com"), { params: Promise.resolve({ service: "unknown" }) })).status).toBe(404);
    expect(merchant).not.toHaveBeenCalled();
  });
});

it("distinguishes missing hosted provider setup from a payment mismatch", async () => {
  inspect.mockRejectedValueOnce(Error("Configure this provider's registry and resolver before hosted verification"));
  const result = await (await rpc("tools/call", { name: "resolve_service", arguments: { name: "bounty-info.ethglobal.ens402.eth" } })).json();
  expect(result.result.isError).toBe(true);
  expect(result.result.content[0].text).toContain("hosted payment verification is not configured");
  expect(result.result.content[0].text).toContain("No mismatch was established");
  expect(merchant).not.toHaveBeenCalled();
});
