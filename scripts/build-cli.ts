import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const result = await build({ absWorkingDir: root, entryPoints: ["scripts/cli/ens402.ts"], bundle: true, platform: "node", format: "esm", target: "node20", minify: true, write: false, banner: { js: '#!/usr/bin/env node\nimport { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' } });
const output = result.outputFiles[0]!.text;
const path = `${root}apps/web/public/downloads/ens402.mjs`;
if (process.argv.includes("--check")) {
  if (await readFile(path, "utf8") !== output) throw new Error("CLI artifact is stale; run pnpm cli:build");
  console.log("CLI artifact matches source");
} else { await mkdir(`${root}apps/web/public/downloads`, { recursive: true }); await writeFile(path, output); console.log(`Built CLI: ${Buffer.byteLength(output)} bytes`); }
