import { config } from "dotenv";
import { DiscoveryStore } from "../packages/server/src/discovery-store";
import { discoveryDatabaseUrl } from "../packages/server/src/discovery-runtime";
config({ path: ".env", quiet: true });
let store: DiscoveryStore | undefined;
try {
  store = new DiscoveryStore(discoveryDatabaseUrl());
  await store.migrate();
  console.log("Discovery schema installed in the separate search database.");
} catch { console.error("Discovery migration failed. Check the separate discovery database configuration."); process.exitCode = 1; }
finally { await store?.close(); }
