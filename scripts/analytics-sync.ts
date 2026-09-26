import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { createPublicClient, http, type PublicClient } from "viem";
import { baseSepolia, sepolia } from "viem/chains";
import { AnalyticsStore } from "../packages/server/src/analytics";
import { analyticsDatabaseUrl } from "../packages/server/src/analytics-runtime";
import {
  JsonCatalogSource,
  searchDiscovery,
} from "../packages/server/src/discovery";
import {
  analyticsIdentities,
  scanAnalytics,
  emptyFacilitators,
  type FacilitatorList,
} from "../indexer/src/analytics";
import { LocalLedgerEvidenceSource } from "../packages/server/src/analytics-ledger";
import { importLedgerProofs } from "../indexer/src/analytics-ledger";
config({ path: ".env", quiet: true });
let store: AnalyticsStore | undefined;
let ledger: LocalLedgerEvidenceSource | undefined;
try {
  if (
    !process.argv[2] ||
    !process.env.SEPOLIA_RPC_URL ||
    !process.env.BASE_SEPOLIA_RPC_URL ||
    !/^\d+$/.test(process.env.ANALYTICS_FROM_BLOCK ?? "")
  )
    throw Error("Missing analytics inputs");
  const catalog = await new JsonCatalogSource(process.argv[2]).load();
  await searchDiscovery({}, { source: { load: async () => catalog } });
  const ens = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL),
  });
  const base = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.BASE_SEPOLIA_RPC_URL),
  });
  store = new AnalyticsStore(analyticsDatabaseUrl());
  await store.observe(catalog, await analyticsIdentities(ens, catalog));
  const facilitators: FacilitatorList = process.env.ANALYTICS_FACILITATORS_FILE
    ? JSON.parse(
        await readFile(process.env.ANALYTICS_FACILITATORS_FILE, "utf8"),
      )
    : emptyFacilitators;
  const scan = await scanAnalytics(base as unknown as PublicClient, store, {
    fromBlock: BigInt(process.env.ANALYTICS_FROM_BLOCK!),
    facilitators,
  });
  let proofCoverage: unknown = { status: "No local payment ledger configured" };
  const ledgerUrl =
    process.env.ANALYTICS_LEDGER_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL;
  if (ledgerUrl) {
    ledger = new LocalLedgerEvidenceSource(ledgerUrl);
    try {
      proofCoverage = await importLedgerProofs(
        base as unknown as PublicClient,
        store,
        ledger,
      );
    } catch {
      proofCoverage = {
        status:
          "Local proof feed unavailable; receipts retain conservative classification",
      };
    }
  }
  console.log(JSON.stringify({ scan, proofCoverage }));
} catch {
  console.error(
    "Analytics sync failed; check finalized catalog, RPC and separate database configuration.",
  );
  process.exitCode = 1;
} finally {
  await ledger?.close();
  await store?.close();
}
