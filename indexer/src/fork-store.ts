/** Isolated PostgreSQL verification for real fork snapshots; never uses application databases. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import assert from "node:assert/strict";
import { DiscoveryStore } from "../../packages/server/src/discovery-store";
import { searchDiscovery, type Catalog } from "../../packages/server/src/discovery";
const exec = promisify(execFile);
export async function verifyStore(first: Catalog, changed: Catalog, expired: Catalog) {
  const directory = await mkdtemp(join(tmpdir(), "ens402-index-store-"));
  let started = false;
  let store: DiscoveryStore | undefined;
  try {
    const socket = createServer(); await new Promise<void>(r => socket.listen(0, "127.0.0.1", r));
    const port = (socket.address() as { port: number }).port; await new Promise<void>(r => socket.close(() => r()));
    await exec("initdb", ["-D", join(directory, "data"), "-U", "ens402_test", "-A", "trust", "--no-locale"]);
    await exec("pg_ctl", ["-D", join(directory, "data"), "-l", join(directory, "postgres.log"), "-o", `-h 127.0.0.1 -p ${port} -k ${directory}`, "-w", "start"]); started = true;
    store = new DiscoveryStore(`postgresql://ens402_test@127.0.0.1:${port}/postgres`);
    await store.migrate();
    await store.synchronize(first, first.source.updatedAt);
    const result = await searchDiscovery({ query: "Weather", mode: "keyword" }, { source: store, now: first.source.updatedAt });
    assert.equal(result.results[0]?.service.name, first.services[0]?.service.name);
    assert.equal(result.results[0]?.service.pricePerRequestAtomic, "10000");
    // Each indexed checkpoint must have monotonically advancing block time.
    assert.ok(changed.source.updatedAt > first.source.updatedAt);
    {
      await store.synchronize(changed, changed.source.updatedAt);
      assert.equal((await store.load()).services[0]?.service.description, "Changed");
    }
    await store.synchronize(expired, expired.source.updatedAt);
    assert.equal((await store.load()).services.length, 0);
    console.log("PASS: native catalog -> isolated PostgreSQL -> keyword results and expired-service removal");
  } finally {
    await store?.close();
    if (started) await exec("pg_ctl", ["-D", join(directory, "data"), "-m", "fast", "-w", "stop"]);
    await rm(directory, { recursive: true, force: true });
  }
}
