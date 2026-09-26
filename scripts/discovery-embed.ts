import { config } from "dotenv";
import { DiscoveryStore } from "../packages/server/src/discovery-store";
import { discoveryDatabaseUrl, configuredEmbeddingProvider } from "../packages/server/src/discovery-runtime";
config({ path: ".env", quiet: true });
let store: DiscoveryStore | undefined;
try {
  const provider = configuredEmbeddingProvider();
  if (!provider) throw new Error("Embedding provider not configured");
  store = new DiscoveryStore(discoveryDatabaseUrl());
  console.log(JSON.stringify(await store.embedPending(provider, { limit: 100 })));
} catch { console.error("Embedding batch failed. Configure the embedding provider and discovery database, then retry."); process.exitCode = 1; }
finally { await store?.close(); }
