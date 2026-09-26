/** Read-only operator checklist. Never prints credentials or sends transactions. */
import { config } from "dotenv";
import { createPublicClient, http, zeroAddress, type Address } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import { readiness } from "../packages/server/src/config";
import { Store } from "../packages/server/src/store";
import { DiscoveryStore } from "../packages/server/src/discovery-store";
import {
  discoveryDatabaseUrl,
  configuredEmbeddingProvider,
} from "../packages/server/src/discovery-runtime";
import {
  currentDeployment,
  currentRegistryAbi,
} from "../packages/sdk/src/ens/current";
config({ path: ".env", quiet: true });
const report: Record<string, unknown> = { configuration: readiness() };
if (process.env.DATABASE_URL) {
  const store = new Store(process.env.DATABASE_URL);
  try {
    await store.health();
    report.accounts = "Database tables ready";
  } catch {
    report.accounts =
      "Unavailable: verify DATABASE_URL and run pnpm db:migrate";
  } finally {
    await store.close();
  }
}
if (process.env.SEPOLIA_RPC_URL) {
  try {
    const client = createPublicClient({
      chain: sepolia,
      transport: http(process.env.SEPOLIA_RPC_URL),
      ccipRead: false,
    });
    if ((await client.getChainId()) !== sepolia.id) throw Error("Wrong chain");
    const block = await client.getBlock();
    const name = normalize(process.env.ENS_PARENT_NAME || "ens402.eth");
    const labels = name.split(".");
    let registry: Address = currentDeployment.rootRegistry;
    for (let index = labels.length - 1; index > 0; index--) {
      registry = await client.readContract({
        address: registry,
        abi: currentRegistryAbi,
        functionName: "getSubregistry",
        args: [labels[index]!],
        blockNumber: block.number,
      });
      if (registry === zeroAddress) throw Error("Missing ancestor");
    }
    const owner = await client.readContract({
      address: registry,
      abi: currentRegistryAbi,
      functionName: "findOwner",
      args: [labels[0]!],
      blockNumber: block.number,
    });
    const child = await client.readContract({
      address: registry,
      abi: currentRegistryAbi,
      functionName: "getSubregistry",
      args: [labels[0]!],
      blockNumber: block.number,
    });
    report.platform = {
      name,
      owner,
      block: String(block.number),
      registry: child,
      next:
        owner === zeroAddress
          ? "Register or renew the parent name"
          : child === zeroAddress
            ? "Owner connects at /provider, opens Platform setup and confirms the prepared transactions"
            : "Registry linked; /provider checks effective grants before proceeding",
      scope: "Pointer observation, not a complete role audit",
    };
  } catch {
    report.platform =
      "Could not read the platform namespace; verify Sepolia RPC and ENS_PARENT_NAME";
  }
}
let discovery: DiscoveryStore | undefined;
try {
  discovery = new DiscoveryStore(discoveryDatabaseUrl());
  const catalog = await discovery.load();
  report.discovery = {
    status: "Catalog stored; freshness is checked by search",
    roots: catalog.source.roots,
    services: catalog.services.length,
    updatedAt: catalog.source.updatedAt,
  };
} catch {
  report.discovery =
    "No readable catalog: provision a separate database, migrate, then request an in-app refresh after platform setup";
} finally {
  await discovery?.close();
}
try {
  const embeddings = configuredEmbeddingProvider();
  report.embeddings = embeddings
    ? { configured: true, model: embeddings.model, liveCallTested: false }
    : "Set all three DISCOVERY_EMBEDDING_* variables for semantic search";
} catch {
  report.embeddings = "Incomplete embedding configuration";
}
report.remainingActions = [
  "Wallet owner: connect the existing owner wallet and confirm native ENS transactions in /provider",
  "Treasury: provide a real Sepolia Safe and verify its owners/threshold; this is distinct from each service recipient",
  "Operator: verify the Vercel Cron route and merchant listing refresh with the configured public catalog",
  "Operator: configure confirmed provider registry/resolver bindings after setup receipts",
  "Buyer: fund the payer shown in Console with Base Sepolia USDC and rehearse one purchase",
];
report.scope =
  "Local environment only. Configured is not deployed or tested. Hosted environment and scheduled execution require separate verification.";
console.log(JSON.stringify(report, null, 2));
