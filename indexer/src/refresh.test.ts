import { expect, it, vi } from "vitest";
import { refreshCatalog, boundedSnapshotClient } from "./refresh";
import type { PublicClient } from "viem";
const catalog = {
  source: {
    id: "test",
    roots: ["ens402.eth"],
    kind: "indexer" as const,
    updatedAt: 1,
  },
  services: [],
};
function store() {
  return {
    acquireRefresh: vi.fn(async () => "lease"),
    finishRefresh: vi.fn(async () => {}),
    assertRefresh: vi.fn(async () => {}),
    synchronize: vi.fn(async () => ({ services: 0 })),
    embedPending: vi.fn(async () => ({
      completed: 0,
      failed: 0,
      superseded: 0,
    })),
  };
}
it("busy/cooldown skips RPC and embedding entirely", async () => {
  const db = store();
  db.acquireRefresh.mockResolvedValue(undefined as unknown as string);
  const build = vi.fn(async () => catalog);
  expect(await refreshCatalog({ store: db, build })).toEqual({
    status: "busy",
  });
  expect(build).not.toHaveBeenCalled();
  expect(db.embedPending).not.toHaveBeenCalled();
  expect(db.finishRefresh).not.toHaveBeenCalled();
});
it("snapshot failure preserves previous catalog and applies failure cooldown", async () => {
  const db = store();
  await expect(
    refreshCatalog({
      store: db,
      build: async () => {
        throw Error("RPC");
      },
    }),
  ).rejects.toThrow("RPC");
  expect(db.synchronize).not.toHaveBeenCalled();
  expect(db.finishRefresh).toHaveBeenCalledWith("lease", 60);
});
it("fences publication when lease was lost", async () => {
  const db = store();
  db.assertRefresh.mockRejectedValue(Error("lost"));
  await expect(
    refreshCatalog({ store: db, build: async () => catalog }),
  ).rejects.toThrow("lost");
  expect(db.synchronize).not.toHaveBeenCalled();
});
it("publishes once with token, bounded embeddings and nonblocking analytics failure", async () => {
  const db = store();
  const result = await refreshCatalog({
    store: db,
    build: async () => catalog,
    embeddings: { model: "test", embed: async () => [1] },
    analytics: async () => {
      throw Error("analytics");
    },
  });
  expect(result).toMatchObject({ status: "refreshed", analytics: "deferred" });
  expect(db.synchronize).toHaveBeenCalledWith(
    catalog,
    expect.any(Number),
    "lease",
  );
  expect(db.embedPending).toHaveBeenCalledWith(
    expect.objectContaining({ model: "test" }),
    { limit: 10 },
  );
});
it("bounds RPC call count and stops aborted traversal", async () => {
  const raw = { getChainId: vi.fn(async () => 11155111) };
  const abort = new AbortController();
  const client = boundedSnapshotClient(
    raw as unknown as PublicClient,
    abort.signal,
    1,
  );
  expect(await client.getChainId()).toBe(11155111);
  await expect(client.getChainId()).rejects.toThrow("budget");
  abort.abort();
  await expect(client.getChainId()).rejects.toThrow();
  expect(raw.getChainId).toHaveBeenCalledTimes(1);
});
