/** In-process finalized catalog refresh for Next.js routes and optional operators. */
import { createPublicClient, http, type PublicClient } from "viem";
import { baseSepolia, sepolia } from "viem/chains";
import { DiscoveryStore } from "../../packages/server/src/discovery-store";
import {
  configuredEmbeddingProvider,
  discoveryDatabaseUrl,
} from "../../packages/server/src/discovery-runtime";
import type {
  Catalog,
  EmbeddingProvider,
} from "../../packages/server/src/discovery";
import { snapshot } from "./snapshot";
import { journalCandidates } from "./journal";
import { AnalyticsStore } from "../../packages/server/src/analytics";
import { analyticsDatabaseUrl } from "../../packages/server/src/analytics-runtime";
import { analyticsIdentities, scanAnalytics } from "./analytics";
import { LocalLedgerEvidenceSource } from "../../packages/server/src/analytics-ledger";
import { importLedgerProofs } from "./analytics-ledger";

export type RefreshResult =
  | { status: "busy" }
  | {
      status: "refreshed";
      services: number;
      excluded: number;
      analytics?: "refreshed" | "deferred";
      embeddings?: { completed: number; failed: number; superseded: number };
    };
type RefreshStore = Pick<
  DiscoveryStore,
  | "acquireRefresh"
  | "finishRefresh"
  | "assertRefresh"
  | "synchronize"
  | "embedPending"
>;

/** Cross-instance lease also fences stale workers before atomic publication. */
export async function refreshCatalog(options: {
  store: RefreshStore;
  build: (signal: AbortSignal) => Promise<Catalog & { excluded?: unknown[] }>;
  embeddings?: EmbeddingProvider;
  cooldownSeconds?: number;
  analytics?: (catalog: Catalog, signal: AbortSignal) => Promise<void>;
}): Promise<RefreshResult> {
  const token = await options.store.acquireRefresh(360);
  if (!token) return { status: "busy" };
  const deadline = Date.now() + 240_000;
  const signal = AbortSignal.timeout(180_000);
  try {
    const catalog = await options.build(signal);
    signal.throwIfAborted();
    await options.store.assertRefresh(token);
    const published = await options.store.synchronize(
      catalog,
      Math.floor(Date.now() / 1000),
      token,
    );
    let embeddings:
      | { completed: number; failed: number; superseded: number }
      | undefined;
    if (options.embeddings) {
      const provider = options.embeddings;
      embeddings = await options.store.embedPending(
        {
          model: provider.model,
          embed: async (text) => {
            if (Date.now() + 20_000 > deadline)
              throw new Error("Refresh embedding budget elapsed");
            await options.store.assertRefresh(token);
            return provider.embed(text);
          },
        },
        { limit: 10 },
      );
    }
    let analytics: "refreshed" | "deferred" | undefined;
    if (options.analytics) {
      try {
        await options.store.assertRefresh(token);
        await options.analytics(
          catalog,
          AbortSignal.timeout(
            Math.max(1, Math.min(30_000, deadline + 20_000 - Date.now())),
          ),
        );
        analytics = "refreshed";
      } catch {
        analytics = "deferred";
      }
    }
    return {
      status: "refreshed",
      ...(analytics ? { analytics } : {}),
      ...published,
      excluded: catalog.excluded?.length ?? 0,
      ...(embeddings ? { embeddings } : {}),
    };
  } finally {
    // Failures also consume the cooldown. Never release another instance's lease.
    await options.store.finishRefresh(token, options.cooldownSeconds ?? 60);
  }
}

/** Bound both elapsed RPC time and total reads; never publish a partial traversal. */
export function boundedSnapshotClient(
  client: PublicClient,
  signal: AbortSignal,
  maxCalls = 2000,
): PublicClient {
  let calls = 0;
  return new Proxy(client, {
    get(target, key) {
      const value = Reflect.get(target, key);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        signal.throwIfAborted();
        if (++calls > maxCalls) throw new Error("Refresh RPC budget exceeded");
        const result = await value.apply(target, args);
        signal.throwIfAborted();
        return result;
      };
    },
  });
}

/** Uses the existing public search database. No subprocess, temporary file or separate host. */
export async function refreshConfiguredCatalog(): Promise<RefreshResult> {
  const rpc = process.env.SEPOLIA_RPC_URL;
  const roots = process.env.INDEXER_ROOTS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const from = process.env.INDEXER_FROM_BLOCK;
  if (
    !rpc ||
    !roots?.length ||
    roots.length > 10 ||
    !from ||
    !/^\d+$/.test(from)
  )
    throw new Error(
      "Configure bounded ENS indexer roots, RPC and starting block",
    );
  if (process.env.ENVIO_GRAPHQL_URL && BigInt(from) < 11700000n)
    throw new Error("Envio journal does not cover requested starting block");
  const embeddings = configuredEmbeddingProvider();
  const store = new DiscoveryStore(discoveryDatabaseUrl());
  try {
    return await refreshCatalog({
      store,
      embeddings,
      ...(process.env.ANALYTICS_DATABASE_URL
        ? { analytics: refreshConfiguredAnalytics }
        : {}),
      build: async (signal) => {
        const client = boundedSnapshotClient(
          createPublicClient({
            chain: sepolia,
            ccipRead: false,
            transport: http(rpc, {
              retryCount: 0,
              timeout: 10_000,
              fetchOptions: { signal },
            }),
          }) as PublicClient,
          signal,
        );
        const finalized = await client.getBlock({ blockTag: "finalized" });
        const requested = process.env.INDEXER_TO_BLOCK;
        if (requested && !/^\d+$/.test(requested))
          throw new Error("Invalid indexer end block");
        const toBlock = requested ? BigInt(requested) : finalized.number;
        if (toBlock > finalized.number)
          throw new Error("Only finalized snapshots may enter the catalog");
        const candidates = process.env.ENVIO_GRAPHQL_URL
          ? await journalCandidates(process.env.ENVIO_GRAPHQL_URL, toBlock, {
              signal,
              maxEvents: 10000,
            })
          : undefined;
        return snapshot(client, {
          roots,
          fromBlock: BigInt(from),
          toBlock,
          candidates,
          maxNames: 100,
        });
      },
    });
  } finally {
    await store.close();
  }
}

/** Independent aggregate receipts; no implicit access to the private payment ledger. */
async function refreshConfiguredAnalytics(
  catalog: Catalog,
  signal: AbortSignal,
): Promise<void> {
  if (
    !process.env.BASE_SEPOLIA_RPC_URL ||
    !/^\d+$/.test(process.env.ANALYTICS_FROM_BLOCK ?? "")
  )
    throw new Error("Analytics configuration incomplete");
  const ens = boundedSnapshotClient(
    createPublicClient({
      chain: sepolia,
      ccipRead: false,
      transport: http(process.env.SEPOLIA_RPC_URL, {
        timeout: 5000,
        retryCount: 0,
        fetchOptions: { signal },
      }),
    }) as PublicClient,
    signal,
    1000,
  );
  const base = boundedSnapshotClient(
    createPublicClient({
      chain: baseSepolia,
      transport: http(process.env.BASE_SEPOLIA_RPC_URL, {
        timeout: 5000,
        retryCount: 0,
        fetchOptions: { signal },
      }),
    }) as PublicClient,
    signal,
    300,
  );
  const store = new AnalyticsStore(analyticsDatabaseUrl());
  try {
    await store.observe(catalog, await analyticsIdentities(ens, catalog));
    await scanAnalytics(base, store, {
      fromBlock: BigInt(process.env.ANALYTICS_FROM_BLOCK!),
      maxChunks: 5,
    });
  } finally {
    await store.close();
  }
}
