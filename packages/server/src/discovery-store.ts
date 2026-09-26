import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { discoverySchema } from "./discovery-schema";
import { discoveryContentHash, discoveryTerms, embedDiscoveryService, searchDiscovery, type Catalog, type CatalogSource, type EmbeddingProvider } from "./discovery";
import { parseDiscoveryQuery, type DiscoveryQuery, type DiscoveryService } from "@ens402/sdk/discovery";

/** Complete, bounded catalog replacement. Configure a separate database from the account ledger. */
export class DiscoveryStore implements CatalogSource {
  private readonly pool: Pool;
  constructor(databaseUrl: string) { this.pool = new Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 10_000, statement_timeout: 15_000 }); }
  async close() { await this.pool.end(); }
  async migrate() { await this.pool.query(discoverySchema); }
  async load(input?: DiscoveryQuery): Promise<Catalog> {
    const query = input ? parseDiscoveryQuery(input) : undefined;
    const terms = query ? discoveryTerms(query.query) : [];
    // PostgreSQL simple tokenization cannot mirror CJK word segmentation. Use the
    // bounded catalog for those queries, then the shared Unicode lexical matcher.
    const indexedKeyword = query?.mode === "keyword" && terms.length > 0 && terms.every(term => /^[a-z0-9]+$/.test(term));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const metadata = await client.query("SELECT source,checkpoint FROM discovery_catalog WHERE id=1");
      if (!metadata.rows[0]) throw new Error("Discovery catalog not synchronized");
      const rows = await client.query(`SELECT s.service, e.model, e.content_hash, e.vector FROM discovery_services s
        LEFT JOIN discovery_embeddings e ON e.name=s.name AND e.content_hash=s.content_hash AND e.vector IS NOT NULL
        ${indexedKeyword ? "WHERE s.name=$1 OR s.search_document @@ to_tsquery('simple',$2)" : ""}
        ORDER BY s.name LIMIT 10001`, indexedKeyword ? [query!.query.toLowerCase(), terms.join(" | ")] : []);
      await client.query("COMMIT");
      if (rows.rows.length > 10_000) throw new Error("Catalog exceeds supported size");
      return { source: metadata.rows[0].source, ...(metadata.rows[0].checkpoint ? { checkpoint: metadata.rows[0].checkpoint } : {}), services: rows.rows.map(row => ({ service: row.service, ...(row.vector ? { embedding: { model: row.model, contentHash: row.content_hash, vector: row.vector } } : {}) })) };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async synchronize(catalog: Catalog, now = Math.floor(Date.now() / 1000)): Promise<{ services: number }> {
    // Run the same schema, provenance, duplicate and freshness gates as the public API.
    await searchDiscovery({}, { source: { load: async () => catalog }, now });
    const hash = createHash("sha256").update(JSON.stringify({ source: catalog.source, checkpoint: catalog.checkpoint, services: [...catalog.services].sort((a,b) => a.service.name.localeCompare(b.service.name)).map(row => row.service) })).digest("hex");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(4022601)");
      const previous = (await client.query("SELECT source,snapshot_hash,checkpoint FROM discovery_catalog WHERE id=1 FOR UPDATE")).rows[0];
      if (previous && (catalog.source.id !== previous.source.id || catalog.source.kind !== previous.source.kind || JSON.stringify(catalog.source.roots) !== JSON.stringify(previous.source.roots))) throw new Error("Catalog source scope changed; use a separate discovery database");
      if (previous && (catalog.source.updatedAt < previous.source.updatedAt || (catalog.source.updatedAt === previous.source.updatedAt && previous.snapshot_hash !== hash))) throw new Error("Outdated or conflicting catalog snapshot");
      if (previous?.checkpoint && catalog.checkpoint && BigInt(catalog.checkpoint.blockNumber) < BigInt(previous.checkpoint.blockNumber)) throw new Error("Finalized checkpoint rollback rejected");
      const names: string[] = [];
      for (const { service } of catalog.services) {
        if (service.status === "deleted") continue;
        names.push(service.name);
        await client.query(`INSERT INTO discovery_services(name,service,content_hash) VALUES($1,$2,$3)
          ON CONFLICT(name) DO UPDATE SET service=EXCLUDED.service,content_hash=EXCLUDED.content_hash`, [service.name, service, discoveryContentHash(service)]);
      }
      await client.query("DELETE FROM discovery_services WHERE NOT(name=ANY($1::text[]))", [names]);
      await client.query("DELETE FROM discovery_embeddings e USING discovery_services s WHERE e.name=s.name AND e.content_hash<>s.content_hash");
      await client.query("INSERT INTO discovery_catalog(id,source,snapshot_hash,checkpoint) VALUES(1,$1,$2,$3) ON CONFLICT(id) DO UPDATE SET source=EXCLUDED.source,snapshot_hash=EXCLUDED.snapshot_hash,checkpoint=EXCLUDED.checkpoint", [catalog.source, hash, catalog.checkpoint ?? null]);
      await client.query("COMMIT");
      return { services: names.length };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  /** Leased jobs prevent concurrent workers from duplicating requests. Failed jobs back off durably. */
  async embedPending(provider: EmbeddingProvider, options: { limit?: number; now?: number } = {}) {
    const now = options.now ?? Math.floor(Date.now() / 1000);
    const limit = options.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Embedding batch must be 1 to 100");
    await this.pool.query(`INSERT INTO discovery_embeddings(name,content_hash,model)
      SELECT name,content_hash,$1 FROM discovery_services WHERE service->>'status'='active' AND (service->>'expiresAt')::bigint>$2
      ON CONFLICT(name) DO UPDATE SET content_hash=EXCLUDED.content_hash,model=EXCLUDED.model,vector=NULL,attempts=0,next_attempt=0,lease=NULL,lease_until=0,last_error=NULL
      WHERE discovery_embeddings.content_hash<>EXCLUDED.content_hash OR discovery_embeddings.model<>EXCLUDED.model`, [provider.model, now]);
    let completed = 0, failed = 0, superseded = 0;
    for (let i = 0; i < limit; i++) {
      const claimNow = options.now ?? Math.floor(Date.now() / 1000);
      const lease = randomUUID();
      const job = (await this.pool.query(`WITH candidate AS (
        SELECT e.name FROM discovery_embeddings e JOIN discovery_services s ON s.name=e.name
        WHERE e.model=$1 AND e.vector IS NULL AND e.next_attempt<=$2 AND e.lease_until<=$2
          AND s.service->>'status'='active' AND (s.service->>'expiresAt')::bigint>$2
        ORDER BY e.next_attempt,e.name FOR UPDATE OF e SKIP LOCKED LIMIT 1
      ) UPDATE discovery_embeddings e SET lease=$3,lease_until=$2+120,attempts=attempts+1
        FROM candidate WHERE e.name=candidate.name RETURNING e.*`, [provider.model, claimNow, lease])).rows[0];
      if (!job) break;
      const row = (await this.pool.query("SELECT service FROM discovery_services WHERE name=$1 AND content_hash=$2", [job.name, job.content_hash])).rows[0];
      if (!row) { superseded++; continue; }
      try {
        const embedding = await embedDiscoveryService(row.service as DiscoveryService, provider);
        const result = await this.pool.query("UPDATE discovery_embeddings SET vector=$1,lease=NULL,lease_until=0,last_error=NULL WHERE name=$2 AND content_hash=$3 AND model=$4 AND lease=$5", [embedding.vector, job.name, embedding.contentHash, provider.model, lease]);
        if (result.rowCount) completed++; else superseded++;
      } catch {
        const delay = Math.min(3600, 30 * 2 ** Math.min(job.attempts - 1, 7));
        await this.pool.query("UPDATE discovery_embeddings SET lease=NULL,lease_until=0,next_attempt=$1,last_error='Embedding provider unavailable' WHERE name=$2 AND lease=$3", [claimNow + delay, job.name, lease]);
        failed++;
      }
    }
    return { completed, failed, superseded };
  }
  /** Durable global query budget bounds public embedding spend across server instances. */
  cachedQueryProvider(provider: EmbeddingProvider, budgetPerMinute = 60): EmbeddingProvider {
    if (!Number.isInteger(budgetPerMinute) || budgetPerMinute < 1 || budgetPerMinute > 1000) throw new Error("Invalid query embedding budget");
    return { model: provider.model, embed: async text => {
      const now = Math.floor(Date.now() / 1000);
      const key = createHash("sha256").update(`${provider.model}\n${text}`).digest("hex");
      const cached = (await this.pool.query("SELECT vector FROM discovery_query_cache WHERE key=$1 AND expires_at>$2", [key, now])).rows[0];
      if (cached) return cached.vector as number[];
      const count = (await this.pool.query("INSERT INTO discovery_query_budget(minute,attempts) VALUES($1,1) ON CONFLICT(minute) DO UPDATE SET attempts=discovery_query_budget.attempts+1 RETURNING attempts", [Math.floor(now / 60)])).rows[0].attempts;
      if (count > budgetPerMinute) throw new Error("Query embedding budget exhausted");
      const vector = await provider.embed(text);
      await this.pool.query("INSERT INTO discovery_query_cache(key,model,vector,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(key) DO UPDATE SET vector=EXCLUDED.vector,expires_at=EXCLUDED.expires_at", [key, provider.model, vector, now + 3600]);
      await this.pool.query("DELETE FROM discovery_query_cache WHERE expires_at<$1", [now]);
      await this.pool.query("DELETE FROM discovery_query_budget WHERE minute<$1", [Math.floor(now / 60) - 60]);
      return vector;
    } };
  }
}
