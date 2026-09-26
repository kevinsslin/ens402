import { afterEach, expect, it, vi } from "vitest";
import { inspectServiceEndpoint } from "../src/components/endpoint-inspection";
afterEach(() => vi.unstubAllGlobals());
it("requires login before making a probe request", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expect(
    inspectServiceEndpoint(
      "https://example.com",
      { method: "GET" },
      async () => null,
    ),
  ).rejects.toThrow("Sign in");
  expect(fetch).not.toHaveBeenCalled();
});
it("uses the protected server probe and includes POST input", async () => {
  const result = {
    metadata: { call: { method: "POST" } },
    offer: { amount: "10000" },
  };
  const fetch = vi.fn(async () => Response.json(result));
  vi.stubGlobal("fetch", fetch);
  expect(
    await inspectServiceEndpoint(
      "https://example.com",
      { method: "POST", example: { city: "Tokyo" } },
      async () => "test-token",
    ),
  ).toEqual(result);
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/provider/probe");
  const body = JSON.parse(init.body as string);
  expect(body.mode).toBe("inspect");
  expect(JSON.parse(body.callConfig)).toEqual({
    method: "POST",
    example: { city: "Tokyo" },
  });
});
it("surfaces missing metadata without inventing a schema", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ error: "Missing service metadata" }, { status: 400 }),
    ),
  );
  await expect(
    inspectServiceEndpoint(
      "https://example.com",
      { method: "GET" },
      async () => "test-token",
    ),
  ).rejects.toThrow("Missing service metadata");
});
