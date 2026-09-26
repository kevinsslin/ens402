import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { authenticate, rateLimit, refresh } = vi.hoisted(() => ({
  authenticate: vi.fn(),
  rateLimit: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@ens402/server/platform", () => ({ authenticate }));
vi.mock("@ens402/server", () => ({ getStore: () => ({ rateLimit }) }));
vi.mock("../../../indexer/src/refresh", () => ({
  refreshConfiguredCatalog: refresh,
}));
import { GET, POST } from "../src/app/api/discovery/sync/route";
const url = "https://ens402.example/api/discovery/sync",
  secret = "a".repeat(40);
function post(headers: Record<string, string> = {}, body?: string) {
  return new Request(url, {
    method: "POST",
    headers: {
      origin: "https://ens402.example",
      authorization: "Bearer user",
      ...headers,
    },
    ...(body !== undefined ? { body } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", secret);
  authenticate.mockResolvedValue({ kind: "user", ownerId: "human" });
  rateLimit.mockResolvedValue(undefined);
  refresh.mockResolvedValue({ status: "refreshed", services: 3 });
});
afterEach(() => vi.unstubAllEnvs());
it("fails closed for missing and weak cron secrets", async () => {
  for (const value of ["", "short"]) {
    vi.stubEnv("CRON_SECRET", value);
    expect(
      (
        await GET(
          new Request(url, { headers: { authorization: `Bearer ${value}` } }),
        )
      ).status,
    ).toBe(503);
  }
  expect(refresh).not.toHaveBeenCalled();
});
it("requires the exact scheduler bearer secret", async () => {
  expect(
    (
      await GET(
        new Request(url, {
          headers: { authorization: `Bearer ${"b".repeat(40)}` },
        }),
      )
    ).status,
  ).toBe(401);
  expect(refresh).not.toHaveBeenCalled();
  expect(
    (
      await GET(
        new Request(url, { headers: { authorization: `Bearer ${secret}` } }),
      )
    ).status,
  ).toBe(200);
});
it("requires same origin and a human account", async () => {
  expect(await POST(post({ origin: "https://evil.example" }))).toHaveProperty(
    "status",
    403,
  );
  authenticate.mockResolvedValue({ kind: "agent", ownerId: "agent" });
  expect((await POST(post())).status).toBe(403);
  expect(refresh).not.toHaveBeenCalled();
});
it("rejects unauthenticated or rate limited requests", async () => {
  authenticate.mockRejectedValueOnce(Error("bad"));
  expect((await POST(post())).status).toBe(401);
  rateLimit.mockRejectedValueOnce(Error("limited"));
  expect((await POST(post())).status).toBe(429);
  expect(refresh).not.toHaveBeenCalled();
});
it("does not accept client-selected targets", async () => {
  expect(
    (await POST(post({}, JSON.stringify({ root: "evil.eth" })))).status,
  ).toBe(400);
  expect(
    (
      await GET(
        new Request(`${url}?root=evil.eth`, {
          headers: { authorization: `Bearer ${secret}` },
        }),
      )
    ).status,
  ).toBe(400);
  expect(refresh).not.toHaveBeenCalled();
});
it("awaits refresh and reports duplicate or cooldown status without claiming completion", async () => {
  refresh.mockResolvedValue({ status: "busy" });
  const response = await POST(post());
  expect(response.status).toBe(202);
  expect(await response.json()).toEqual({ status: "busy" });
  expect(rateLimit).toHaveBeenCalledWith("discovery-sync:human", 3);
  expect(refresh).toHaveBeenCalledWith();
});
it("sanitizes refresh failures", async () => {
  refresh.mockRejectedValue(Error("postgres://private-secret"));
  const response = await POST(post());
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain("private-secret");
});
