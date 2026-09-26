/** Read-only discovery readiness check. Never prints credentials or performs paid embedding calls. */
import { config } from "dotenv";
import { DiscoveryStore } from "../packages/server/src/discovery-store";
import { discoveryDatabaseUrl, configuredEmbeddingProvider } from "../packages/server/src/discovery-runtime";
import { searchDiscovery } from "../packages/server/src/discovery";
config({ path: ".env", quiet: true });
const report: Record<string, unknown> = {};
let store: DiscoveryStore | undefined;
try {
  store = new DiscoveryStore(discoveryDatabaseUrl());
  const catalog = await store.load();
  const search = await searchDiscovery({ mode: "keyword" }, { source: store });
  report.database = "Connected; schema and catalog ready";
  report.catalog = { source: catalog.source.id, roots: catalog.source.roots, updatedAt: catalog.source.updatedAt, services: catalog.services.length, activeSample: search.results.length, embedded: catalog.services.filter(row => row.embedding).length };
} catch {
  report.database = "Not ready: set DISCOVERY_DATABASE_URL, run discovery:migrate and discovery:refresh; catalog must be fresh";
  process.exitCode = 1;
} finally { await store?.close(); }
try {
  const provider = configuredEmbeddingProvider();
  report.embeddings = provider ? { configured: true, model: provider.model, liveCallTested: false } : "Not configured: keyword search remains available; set all three DISCOVERY_EMBEDDING_* values for semantic search";
} catch { report.embeddings = "Incomplete configuration: set endpoint, API key and model together"; process.exitCode = 1; }
report.indexer = {
  rootsConfigured: Boolean(process.env.INDEXER_ROOTS),
  startingBlockConfigured: Boolean(process.env.INDEXER_FROM_BLOCK),
  rpcConfigured: Boolean(process.env.SEPOLIA_RPC_URL),
  publicSetupRequired: "Publish provider registry, shared resolver and complete service records before indexing",
};
console.log(JSON.stringify(report, null, 2));
