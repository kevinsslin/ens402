/** Regenerate locally with Forge, or check source provenance during a hosted build without Forge. */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
async function sources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? sources(join(directory, entry.name))
          : [join(directory, entry.name)],
      ),
    )
  ).flat();
}
const inputs = [
  ...(await sources(join(root, "contracts/src"))),
  join(root, "contracts/foundry.toml"),
].sort();
const digest = createHash("sha256");
for (const path of inputs)
  digest
    .update(relative(root, path))
    .update("\0")
    .update(await readFile(path))
    .update("\0");
const sourceDigest = digest.digest("hex");
const output = join(root, "apps/web/src/server/provider-artifact.json");
if (process.argv.includes("--check")) {
  const artifact = JSON.parse(await readFile(output, "utf8"));
  if (artifact.sourceDigest !== sourceDigest)
    throw Error(
      "Provider deployment artifact is stale. Run pnpm provider:artifact and commit the result.",
    );
  console.log("Provider deployment artifact matches Solidity source");
} else {
  const artifact = JSON.parse(
    await readFile(
      join(
        root,
        "contracts/out/SharedProviderServiceRegistrar.sol/SharedProviderServiceRegistrar.json",
      ),
      "utf8",
    ),
  );
  await writeFile(
    output,
    JSON.stringify({
      sourceDigest,
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      deployedBytecode: artifact.deployedBytecode,
    }),
  );
  console.log(
    "Updated provider onboarding artifact from compiled SharedProviderServiceRegistrar",
  );
}
