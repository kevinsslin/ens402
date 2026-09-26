import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { NETWORK, USDC } from "@ens402/sdk";
import { DiscoveryStore } from "../src/discovery-store";
import { searchDiscovery, type Catalog } from "../src/discovery";
import { discoveryDatabaseUrl, configuredEmbeddingProvider, discoveryQueryBudget } from "../src/discovery-runtime";
const exec = promisify(execFile);
let directory: string, store: DiscoveryStore, other: DiscoveryStore;
let started = false;
let databaseUrl: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "ens402-search-test-"));
  const socket = createServer(); await new Promise<void>(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = (socket.address() as { port: number }).port; await new Promise<void>(resolve => socket.close(() => resolve()));
  await exec("initdb", ["-D", join(directory, "data"), "-U", "ens402_test", "-A", "trust", "--no-locale"]);
  await exec("pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ${directory}`, "-w", "start"]); started = true;
  const url = `postgresql://ens402_test@127.0.0.1:${port}/postgres`;
  databaseUrl = url;
  store = new DiscoveryStore(url); other = new DiscoveryStore(url); await store.migrate();
}, 60000);
afterAll(async () => {
  await store?.close(); await other?.close();
  if (started) await exec("pg_ctl", ["-D", join(directory, "data"), "-m", "fast", "-w", "stop"]);
  if (directory) await rm(directory, { recursive: true, force: true });
});
function catalog(time: number, description = "Weather forecasts"): Catalog {
  return { checkpoint: { chainId: 11155111, fromBlock: "1", blockNumber: String(time), blockHash: `0x${"a".repeat(64)}` }, source: { id: "test", roots: ["ens402.eth"], kind: "indexer", updatedAt: time }, services: [{ service: {
    name: "weather.dataco.ens402.eth", description, endpoint: "https://example.com/weather", paymentNetwork: NETWORK, assetAddress: USDC,
    assetDecimals: 6, pricePerRequestAtomic: "9007199254740993", payTo: `0x${"1".repeat(40)}`, indexedBlock: String(time), indexedAt: time,
    expiresAt: 100000, status: "active", fixture: true, call: { method: "GET", inputSchema: { type: "object" } },
  } }] };
}
const embedding = { model: "test", embed: async () => [1, 0] };
describe("real isolated PostgreSQL discovery store", () => {
  it("coordinates refresh leases and cooldown across separate database connections", async () => {
    const token = await store.acquireRefresh();
    expect(token).toBeTruthy();
    expect(await other.acquireRefresh()).toBeUndefined();
    await expect(other.assertRefresh("wrong-token")).rejects.toThrow("expired");
    await other.finishRefresh("wrong-token", 0);
    expect(await other.acquireRefresh()).toBeUndefined();
    await store.finishRefresh(token!, 60);
    expect(await other.acquireRefresh()).toBeUndefined();
    await expect(store.synchronize(catalog(999), 999, token!)).rejects.toThrow("expired");
    await store.finishRefresh(token!, 0);
    const next = await other.acquireRefresh();
    expect(next).toBeTruthy(); expect(next).not.toBe(token);
    await expect(store.assertRefresh(token!)).rejects.toThrow("expired");
    await other.finishRefresh(next!, 0);
  });
  it("persists snapshots and exact atomic prices across connections", async () => {
    await store.synchronize(catalog(1000), 1000);
    expect((await other.load()).checkpoint?.blockNumber).toBe("1000");
    expect((await searchDiscovery({ query: "weather", mode: "keyword" }, { source: other, now: 1000 })).results).toHaveLength(1);
    expect((await searchDiscovery({ query: "unrelated", mode: "keyword" }, { source: other, now: 1000 })).results).toHaveLength(0);
    expect((await other.load()).services[0]?.service.pricePerRequestAtomic).toBe("9007199254740993");
    expect((await searchDiscovery({ maxPricePerRequestAtomic: "9007199254740992" }, { source: other, now: 1000 })).results).toHaveLength(0);
  });
  it("embeds once, keeps unchanged metadata vectors, invalidates changed descriptions", async () => {
    expect(await store.embedPending(embedding, { now: 1000 })).toMatchObject({ completed: 1 });
    await store.synchronize(catalog(1001), 1001);
    expect((await store.load()).services[0]?.embedding?.model).toBe("test");
    const semantic = await searchDiscovery({ query: "rain tomorrow" }, { source: other, embeddings: embedding, now: 1001 });
    expect(semantic.semantic).toBe("used");
    expect(semantic.results[0]?.match).toContain("semantic");
    expect(await store.embedPending(embedding, { now: 1001 })).toMatchObject({ completed: 0 });
    await store.synchronize(catalog(1002, "Currency conversion"), 1002);
    expect((await store.load()).services[0]?.embedding).toBeUndefined();
  });
  it("durably backs off provider failures and retries when due", async () => {
    expect(await store.embedPending({ model: "test", embed: async () => { throw new Error("private upstream error"); } }, { now: 1002 })).toMatchObject({ failed: 1 });
    expect(await other.embedPending(embedding, { now: 1003 })).toMatchObject({ completed: 0 });
    expect(await other.embedPending(embedding, { now: 1032 })).toMatchObject({ completed: 1 });
  });
  it("never installs an embedding after metadata changes during the request", async () => {
    await store.synchronize(catalog(1033, "New weather"), 1033);
    const result = await store.embedPending({ model: "test", embed: async () => {
      await other.synchronize(catalog(1034, "Newer weather"), 1034); return [1, 0];
    } }, { now: 1033, limit: 1 });
    expect(result.superseded).toBe(1);
    expect((await store.load()).services[0]?.embedding).toBeUndefined();
  });
  it("leases jobs across workers and rotates embedding models", async () => {
    let release!: () => void, began!: () => void;
    const startedRequest = new Promise<void>(resolve => { began = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const first = store.embedPending({ model: "test", embed: async () => { began(); await hold; return [1, 0]; } }, { now: 1034 });
    await startedRequest;
    expect((await other.embedPending(embedding, { now: 1034 })).completed).toBe(0);
    release(); expect((await first).completed).toBe(1);
    expect((await other.embedPending({ ...embedding, model: "v2" }, { now: 1035 })).completed).toBe(1);
    expect((await store.load()).services[0]?.embedding?.model).toBe("v2");
  });
  it("refuses rollback, conflicting snapshots and changed source scope", async () => {
    await expect(store.synchronize(catalog(1000), 1034)).rejects.toThrow("Outdated");
    await expect(store.synchronize(catalog(1034, "Conflicting"), 1034)).rejects.toThrow("conflicting");
    const changed = catalog(1035); changed.source.id = "other";
    await expect(store.synchronize(changed, 1035)).rejects.toThrow("scope");
    expect((await store.load()).services[0]?.service.description).toBe("Newer weather");
  });
  it("omitted and explicitly deleted services disappear along with embeddings", async () => {
    const snapshot = catalog(1036); snapshot.services[0]!.service.status = "deleted";
    await store.synchronize(snapshot, 1036);
    expect((await store.load()).services).toHaveLength(0);
    await store.synchronize(catalog(1037), 1037);
    const empty = catalog(1038); empty.services = [];
    await store.synchronize(empty, 1038);
    expect((await store.load()).services).toHaveLength(0);
  });
  it("shares query cache and limits paid misses across instances", async () => {
    let calls = 0; const provider = { model: "query-test", embed: async () => { calls++; return [1, 0]; } };
    await store.cachedQueryProvider(provider, 1).embed("rain");
    await other.cachedQueryProvider(provider, 1).embed("rain");
    expect(calls).toBe(1);
    await expect(other.cachedQueryProvider(provider, 1).embed("sun")).rejects.toThrow("budget");
    expect(calls).toBe(1);
  });
  it("serves a synchronized and embedded catalog through the actual API and SDK", async () => {
    const now = Math.floor(Date.now() / 1000);
    const snapshot = catalog(now); snapshot.services[0]!.service.expiresAt = now + 3600;
    await store.synchronize(snapshot, now);
    await store.embedPending(embedding, { now });
    const { GET } = await import("../../../apps/web/src/app/api/discover/route");
    const { discover } = await import("../../sdk/src/discovery");
    const { closeConfiguredDiscovery } = await import("../src/discovery-runtime");
    vi.stubEnv("DISCOVERY_DATABASE_URL", databaseUrl);
    vi.stubEnv("DATABASE_URL", "postgres://unused@localhost/private-account-db");
    vi.stubEnv("DISCOVERY_EMBEDDING_ENDPOINT", ""); vi.stubEnv("DISCOVERY_EMBEDDING_API_KEY", ""); vi.stubEnv("DISCOVERY_EMBEDDING_MODEL", "");
    try {
      const response = await discover({ query: "weather", mode: "keyword" }, { apiUrl: "https://example.com/api/discover", expectedRoots: ["ens402.eth"], fetch: async url => GET(new Request(String(url))) });
      expect(response.results[0]?.service.name).toBe("weather.dataco.ens402.eth");
      expect(response.checkpoint?.blockNumber).toBe(String(now));
      expect(response.requiresFreshResolution).toBe(true);
      expect((await GET(new Request("https://example.com/api/discover?pageSize=100"))).status).toBe(400);
      expect((await GET(new Request("https://example.com/api/discover?query=one&query=two"))).status).toBe(400);
    } finally { await closeConfiguredDiscovery(); vi.unstubAllEnvs(); }
  });

});
it("requires separate account and search databases and complete embedding config", () => {
  expect(() => discoveryDatabaseUrl({ DATABASE_URL: "postgres://account@localhost:5432/same", DISCOVERY_DATABASE_URL: "postgres://search@localhost/same" })).toThrow("separate");
  expect(configuredEmbeddingProvider({})).toBeUndefined();
  expect(() => configuredEmbeddingProvider({ DISCOVERY_EMBEDDING_MODEL: "test" })).toThrow("together");
});

it("normalizes Neon pooled hostname aliases and validates query spend budgets", () => {
  expect(() => discoveryDatabaseUrl({ DATABASE_URL: "postgres://account@ep-test.aws.neon.tech/app", DISCOVERY_DATABASE_URL: "postgres://search@ep-test-pooler.aws.neon.tech/app" })).toThrow("separate");
  expect(discoveryQueryBudget({ DISCOVERY_QUERY_EMBEDDINGS_PER_MINUTE: "10" })).toBe(10);
  for (const budget of ["0", "1001", "1e2", "-1"]) expect(() => discoveryQueryBudget({ DISCOVERY_QUERY_EMBEDDINGS_PER_MINUTE: budget })).toThrow();
});
