/** Optional long-running operator using the same leased in-process refresh as Next.js. */
import { config } from "dotenv";
import { refreshConfiguredCatalog } from "./refresh";
config({ path: ".env", quiet: true });
const once = process.argv.includes("--once");
const interval = Number(process.env.INDEXER_POLL_SECONDS ?? 60);
if (!Number.isInteger(interval) || interval < 15) throw Error("INDEXER_POLL_SECONDS must be at least 15");
let stopped = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stopped = true; });
do {
  try { console.log(JSON.stringify(await refreshConfiguredCatalog())); }
  catch {
    console.error("Catalog refresh failed; check RPC and database configuration. No partial snapshot is published.");
    if (once) process.exitCode = 1;
  }
  if (once || stopped) break;
  for (let i = 0; i < interval && !stopped; i++) await new Promise(resolve => setTimeout(resolve, 1000));
} while (!stopped);
