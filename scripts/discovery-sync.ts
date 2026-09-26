import { config } from "dotenv";
import { JsonCatalogSource } from "../packages/server/src/discovery";
import { DiscoveryStore } from "../packages/server/src/discovery-store";
import { discoveryDatabaseUrl, configuredEmbeddingProvider } from "../packages/server/src/discovery-runtime";
config({ path: ".env", quiet: true });
let store: DiscoveryStore | undefined;
try {
  const path = process.argv[2];
  if (!path) throw new Error("Snapshot required");
  store = new DiscoveryStore(discoveryDatabaseUrl());
  const snapshot = await new JsonCatalogSource(path).load();
  const synchronized = await store.synchronize(snapshot);
  const provider = configuredEmbeddingProvider();
  const embeddings = provider ? await store.embedPending(provider) : { status: "unconfigured" };
  console.log(JSON.stringify({ synchronized, embeddings }));
} catch { console.error("Discovery sync failed. Verify snapshot completeness, freshness and database configuration."); process.exitCode = 1; }
finally { await store?.close(); }
