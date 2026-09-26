import { config } from "dotenv";
import { AnalyticsStore } from "../packages/server/src/analytics";
import { analyticsDatabaseUrl } from "../packages/server/src/analytics-runtime";
config({ path: ".env", quiet: true });
let store: AnalyticsStore | undefined;
try {
  store = new AnalyticsStore(analyticsDatabaseUrl());
  await store.migrate();
  console.log("Analytics schema ready in the separate public-data database.");
} catch {
  console.error("Analytics migration failed; check database configuration.");
  process.exitCode = 1;
} finally {
  await store?.close();
}
