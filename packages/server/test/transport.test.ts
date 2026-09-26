import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  fetch: vi.fn(), close: vi.fn(), destroy: vi.fn(), destroyed: false,
}));
vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "8.8.8.8", family: 4 }] }));
vi.mock("undici", () => ({
  fetch: state.fetch,
  Agent: class {
    close() { return state.close(); }
    destroy() { return state.destroy(); }
  },
}));
import { createResourceTransport } from "../src/transport";
const request = () => createResourceTransport(["https://merchant.example"])("https://merchant.example/api", {
  method: "GET", redirect: "error", signal: AbortSignal.timeout(1000),
});
beforeEach(() => {
  vi.clearAllMocks();
  state.destroyed = false;
  state.close.mockImplementation(async () => {
    if (state.destroyed) throw Error("The client is destroyed");
  });
  state.destroy.mockImplementation(async () => { state.destroyed = true; });
});
it("cancels a headers-only probe while a body read is pending without double cleanup", async () => {
  const cancel = vi.fn();
  state.fetch.mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 402 }));
  const response = await request();
  await expect(response.body!.cancel()).resolves.toBeUndefined();
  expect(cancel).toHaveBeenCalledOnce();
  expect(state.close).toHaveBeenCalledOnce();
  expect(state.destroy).not.toHaveBeenCalled();
});
it("keeps normal response bodies readable and closes once after consumption", async () => {
  state.fetch.mockResolvedValue(new Response("payload"));
  const response = await request();
  expect(await response.text()).toBe("payload");
  expect(state.close).toHaveBeenCalledOnce();
  expect(state.destroy).not.toHaveBeenCalled();
});
it("preserves upstream body failures", async () => {
  state.fetch.mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.error(Error("broken body")); } })));
  const response = await request();
  await expect(response.text()).rejects.toThrow("broken body");
  expect(state.close).toHaveBeenCalledOnce();
});
