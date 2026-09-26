import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { cliSearchCommand } from "../src/lib/cli-command";
it("preserves the query as one literal shell argument and retains search filters", () => {
  const query = "Tokyo's weather $(printf BAD) `printf BAD`\n--help";
  const command = cliSearchCommand(query, "10000", 20).split("\n").slice(1).join("\n");
  const args = execFileSync("/bin/sh", ["-c", command.replace("node ens402.mjs search ", "printf '%s\\n' ")], {encoding: "utf8"});
  expect(args).toBe(`--limit\n20\n--max-price-atomic\n10000\n--\n${query}\n`);
});
it("rejects non-numeric options and supports an empty browse query", () => {
  expect(() => cliSearchCommand("weather", "1; exit")).toThrow();
  expect(cliSearchCommand("", undefined, 20)).toContain("search --limit 20 -- ''");
});

it("separates a leading option-like query from CLI flags", () => {
  expect(cliSearchCommand("--help")).toContain("--limit 3 -- '--help'");
});
