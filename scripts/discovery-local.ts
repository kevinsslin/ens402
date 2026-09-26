/** Start a separate loopback-only development search database. Does not change DATABASE_URL. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, access, chmod } from "node:fs/promises";
import { resolve } from "node:path";
const exec = promisify(execFile);
const directory = resolve(".local/discovery-postgres");
const url = "postgresql://ens402_search@127.0.0.1:5443/ens402_discovery";
let env = "";
try { env = await readFile(".env", "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
const existing = env.split("\n").find(line => line.startsWith("DISCOVERY_DATABASE_URL="))?.slice("DISCOVERY_DATABASE_URL=".length).trim();
if (existing && existing !== url) throw new Error("DISCOVERY_DATABASE_URL already configured; this helper will not replace it");
await mkdir(directory, { recursive: true, mode: 0o700 });
let initialized = true;
try { await access(`${directory}/data/PG_VERSION`); } catch { initialized = false; }
if (!initialized) await exec("initdb", ["-D", `${directory}/data`, "-U", "ens402_search", "-A", "trust", "--no-locale"]);
let running = true;
try { await exec("pg_ctl", ["-D", `${directory}/data`, "status"]); } catch { running = false; }
if (!running) await exec("pg_ctl", ["-D", `${directory}/data`, "-l", `${directory}/postgres.log`, "-o", `-h 127.0.0.1 -p 5443 -k ${directory}`, "-w", "start"]);
const database = await exec("psql", ["-h", "127.0.0.1", "-p", "5443", "-U", "ens402_search", "-d", "postgres", "-Atc", "SELECT 1 FROM pg_database WHERE datname='ens402_discovery'"]);
if (database.stdout.trim() !== "1") await exec("createdb", ["-h", "127.0.0.1", "-p", "5443", "-U", "ens402_search", "ens402_discovery"]);
if (!existing) {
  env = env.split("\n").filter(line => !line.startsWith("DISCOVERY_DATABASE_URL=")).join("\n");
  await writeFile(".env", `${env}\nDISCOVERY_DATABASE_URL=${url}\n`, { mode: 0o600 });
  await chmod(".env", 0o600);
}
console.log("Local discovery database ready on loopback port 5443. Account DATABASE_URL unchanged. Run pnpm discovery:migrate.");
