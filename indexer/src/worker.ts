/** Repeat complete finalized snapshots and atomic catalog sync. No onchain writes. */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { config } from "dotenv";
config({ path: ".env" });
const once = process.argv.includes("--once");
const interval = Number(process.env.INDEXER_POLL_SECONDS ?? 60);
if (!Number.isInteger(interval) || interval < 15) throw Error("INDEXER_POLL_SECONDS must be at least 15");
let stopped = false;
let active: ReturnType<typeof spawn> | undefined;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stopped = true; active?.kill(signal); });
function run(script: string, path: string) {
  return new Promise<void>((ok, bad) => {
    active = spawn(resolve("node_modules/.bin/tsx"), [script, path], { stdio: "inherit", env: process.env });
    active.on("error", bad);
    active.on("exit", code => { active = undefined; code === 0 ? ok() : bad(Error("Catalog stage failed")); });
  });
}
const directory = await mkdtemp(`${tmpdir()}/ens402-catalog-`);
try {
  do {
    try {
      const path = resolve(directory, "catalog.json");
      await run("indexer/src/export.ts", path);
      if (!stopped) await run("scripts/discovery-sync.ts", path);
    } catch {
      console.error("Catalog refresh failed; retaining previous database snapshot. Check indexer, RPC and database configuration.");
      if (once) process.exitCode = 1;
    }
    if (once || stopped) break;
    // Small interruptible sleeps keep termination responsive and never overlap refreshes.
    for (let i = 0; i < interval && !stopped; i++) await new Promise(r => setTimeout(r, 1000));
  } while (!stopped);
} finally { await rm(directory, { recursive: true, force: true }); }
