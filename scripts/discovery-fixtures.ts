import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { NETWORK, USDC, addressPattern } from "../packages/sdk/src/index";
import type { DiscoveryService } from "../packages/sdk/src/discovery";
import { validateDiscoveryService } from "../packages/sdk/src/discovery";

/** Generate an explicitly simulated catalog. It does not register names or claim chain ingestion. */
const output = process.argv[2];
if (!output) throw new Error("Usage: pnpm exec tsx scripts/discovery-fixtures.ts <output.json>");
const origin = new URL(process.env.MERCHANT_RESOURCE_URL ?? "https://ens402.vercel.app/api/merchant/search");
if (origin.protocol !== "https:") throw new Error("Fixture merchant URL must use HTTPS");
const parent = process.env.PROVIDER_ENS_NAME ?? "demo.ens402.eth";
const payTo = process.env.MERCHANT_PAY_TO;
if (!payTo || !addressPattern.test(payTo)) throw new Error("Configure MERCHANT_PAY_TO to match the merchant challenge");
const now = Math.floor(Date.now() / 1000);
const entries = [
  ["weather", "Demo fixture: weather forecast for Tokyo, temperature and conditions"],
  ["fx", "Demo fixture: USD JPY currency foreign exchange rate"],
  ["research", "Demo fixture: agent payment verification research summary"],
];
const outputs: Record<string, Record<string, unknown>> = {
  weather: { fixture: true, liveData: false, city: "Tokyo", temperatureC: 24, condition: "Partly cloudy" },
  fx: { fixture: true, liveData: false, base: "USD", quote: "JPY", rate: "145.25" },
  research: { fixture: true, liveData: false, title: "Agent payment verification", summary: "Compare current ENS payment terms with HTTP 402 before signing." },
};
const services = entries.map(([label, description]) => {
  const service: DiscoveryService = { name: `${label === "fx" ? "rates" : label}.${parent}`, description: description!, endpoint: new URL(`/api/merchant/fixtures/${label}`, origin).href, paymentNetwork: NETWORK, assetAddress: USDC, assetDecimals: 6, pricePerRequestAtomic: process.env.MERCHANT_PRICE_UNITS ?? "10000", payTo, indexedBlock: "0", indexedAt: now, expiresAt: now + 86400, status: "active", fixture: true, call: { method: "GET", fixture: true, outputExample: outputs[label!], inputSchema: { type: "object", properties: {}, additionalProperties: false }, example: {} } };
  validateDiscoveryService(service);
  return { service };
});
await writeFile(output, `${JSON.stringify({ source: { id: "ens402-demo-fixtures-not-chain-indexed", roots: [parent], updatedAt: now, kind: "snapshot" }, services }, null, 2)}\n`, { mode: 0o600 });
console.log(`Wrote ${services.length} labeled fixture candidates. Block 0 means simulated provenance. ENS names must be registered before Guard can purchase.`);
