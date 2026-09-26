import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { discover, DiscoveryApiError } from "../../packages/sdk/src/discovery";
import { ENS402Client } from "../../packages/sdk/src/platform";
import { formatUnits } from "viem";
import { baseUrl, CliError, loadConfig, paymentSummary, compactExecution, executePayment, uuid } from "./core";

const help = `ENS402 CLI (Node.js 22+, testnets only)
  search "your task" [--limit 3] [--max-price-atomic 10000] [--base-url https://ens402.vercel.app]
  inspect service.provider.ens402.eth [--base-url URL]
  pay --config checkout.json --id UUID [--request request.json] [--yes]
  status --config checkout.json --id UUID
  reconcile --config checkout.json --id UUID --tx 0x...

Search is public. Export an active checkout from Console for payment.
Self signing: node --env-file=.env ens402.mjs pay ...
The file must set ENS402_PRIVATE_KEY for the payer in the checkout.
Use --yes only after the user approves the displayed fixed-price checkout.
Save each --id and reuse it for status/reconciliation, never blindly retry.
`;

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    "base-url": { type: "string" }, limit: { type: "string" }, "max-price-atomic": { type: "string" }, config: { type: "string" }, id: { type: "string" }, request: { type: "string" }, tx: { type: "string" }, yes: { type: "boolean" }, help: { type: "boolean" },
  } });
  const [command, query] = positionals;
  if (!command || command === "help" || values.help) { console.log(help); return; }
  if (!["search", "inspect", "pay", "status", "reconcile"].includes(command)) throw new CliError("Unknown command. Run help.");
  if (command === "search") {
    if (positionals.length !== 2) throw new CliError('Provide one quoted search query');
    const origin = baseUrl(values["base-url"] || "https://ens402.vercel.app");
    const result = await discover({ query, mode: "hybrid", pageSize: Number(values.limit ?? 3), maxPricePerRequestAtomic: values["max-price-atomic"] }, { apiUrl: `${origin}/api/discover` });
    console.log(JSON.stringify({ services: result.results.map(({service}) => ({ name: service.name, description: service.description, price: `${formatUnits(BigInt(service.pricePerRequestAtomic), service.assetDecimals)} USDC / request`, demo: service.fixture, console: `${origin}/console?service=${encodeURIComponent(service.name)}` })), semantic: result.semantic }, null, 2));
    return;
  }
  if (command === "inspect") {
    if (positionals.length !== 2 || !query || !/^[a-z0-9.-]+\.eth$/.test(query)) throw new CliError("Provide an ENS service name");
    const origin = baseUrl(values["base-url"] || "https://ens402.vercel.app");
    const response = await fetch(`${origin}/api/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, redirect: "error", signal: AbortSignal.timeout(20_000), body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "resolve_service", arguments: { name: query } } }) });
    if (!response.ok) throw new CliError("ENS inspection unavailable");
    const result = await response.json() as { error?: unknown; result?: { isError?: boolean; content?: Array<{ text: string }> } };
    if (result.error || result.result?.isError || !result.result?.content?.[0]?.text) throw new CliError("ENS inspection unavailable");
    console.log(JSON.stringify(JSON.parse(result.result.content[0].text), null, 2)); return;
  }
  if (positionals.length !== 1 || !values.config || !values.id || !uuid(values.id)) throw new CliError("Provide --config checkout.json and --id UUID");
  if (values["base-url"]) throw new CliError("Payment API is pinned by the exported checkout; --base-url is only for search/inspect");
  const config = await loadConfig(values.config);
  const client = new ENS402Client({ baseUrl: config.baseUrl, apiKey: config.apiKey });
  if (command === "status") { console.log(JSON.stringify(compactExecution(await client.execution(values.id)), null, 2)); return; }
  if (command === "reconcile") {
    if (!/^0x[0-9a-fA-F]{64}$/.test(values.tx ?? "")) throw new CliError("Provide the settlement transaction hash with --tx");
    console.log(JSON.stringify(compactExecution(await client.reconcile(values.id, values.tx!)), null, 2)); return;
  }
  let request;
  if (values.request) {
    try { const text = await readFile(values.request, "utf8"); if (text.length > 16384) throw new Error(); request = JSON.parse(text); }
    catch { throw new CliError("Invalid request file; expected { method: POST, body: JSON_STRING } with an orderId"); }
  }
  console.error(paymentSummary(config));
  let confirmed = values.yes === true;
  if (!confirmed && process.stdin.isTTY) {
    const terminal = createInterface({ input: process.stdin, output: process.stderr });
    try { confirmed = (await terminal.question("Pay this amount once? Type yes: ")).trim() === "yes"; }
    finally { terminal.close(); }
  }
  const result = await executePayment({ config, configPath: values.config, id: values.id, confirmed, request, privateKey: process.env.ENS402_PRIVATE_KEY }, client);
  console.log(JSON.stringify(compactExecution(result), null, 2));
  if (result.receipt?.state !== "settled") process.exitCode = 2;
}
main().catch(error => {
  console.error(error instanceof DiscoveryApiError ? `Search unavailable (HTTP ${error.status}). The operator may need to refresh the catalog; try again after refresh.` : error instanceof CliError ? error.message : "Operation failed. For a payment, check status with the same id before retrying. No credentials or signature data were printed.");
  process.exitCode = 1;
});
