import { DiscoveryStore } from "./discovery-store";
import { OpenAiDiscoveryRelevance, type DiscoveryRelevance } from "./discovery-relevance";
import { HttpEmbeddingProvider, JsonCatalogSource, type CatalogSource, type EmbeddingProvider } from "./discovery";

/** The search store must not share a database with private account/payment tables. */
export function discoveryDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  const value = env.DISCOVERY_DATABASE_URL?.trim();
  if (!value) throw new Error("Configure DISCOVERY_DATABASE_URL");
  const parsed = new URL(value);
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) throw new Error("Invalid discovery database URL");
  if (env.DATABASE_URL) {
    const account = new URL(env.DATABASE_URL);
    if (account.hostname.replace(/-pooler(?=\.)/, "") === parsed.hostname.replace(/-pooler(?=\.)/, "") && (account.port || "5432") === (parsed.port || "5432") && account.pathname === parsed.pathname) throw new Error("Use a separate discovery database from the account ledger");
  }
  return value;
}
export function configuredEmbeddingProvider(env: Record<string, string | undefined> = process.env): EmbeddingProvider | undefined {
  const fields = [env.DISCOVERY_EMBEDDING_ENDPOINT, env.DISCOVERY_EMBEDDING_API_KEY, env.DISCOVERY_EMBEDDING_MODEL].map(value => value?.trim());
  if (!fields.some(Boolean)) return undefined;
  if (!fields.every(Boolean)) throw new Error("Configure embedding endpoint, API key and model together");
  return new HttpEmbeddingProvider({ endpoint: fields[0]!, apiKey: fields[1]!, model: fields[2]! });
}
let store: DiscoveryStore | undefined;
let relevance: DiscoveryRelevance | undefined;
/** File snapshots remain a keyword-only local fallback; paid query embeddings require a DB budget. */
export function configuredDiscovery(): { source: CatalogSource; embeddings?: EmbeddingProvider; relevance?: DiscoveryRelevance } {
  if (process.env.DISCOVERY_DATABASE_URL) {
    store ??= new DiscoveryStore(discoveryDatabaseUrl());
    const provider = configuredEmbeddingProvider();
    if (provider && !relevance) {
      relevance = process.env.DISCOVERY_EMBEDDING_ENDPOINT?.trim() === "https://api.openai.com/v1/embeddings"
        ? new OpenAiDiscoveryRelevance({ apiKey: process.env.DISCOVERY_EMBEDDING_API_KEY!.trim(), model: process.env.DISCOVERY_RELEVANCE_MODEL?.trim(), beforeRequest: () => store!.reserveQueryBudget(discoveryQueryBudget()) })
        : { select: async () => { throw new Error("Relevance provider not configured"); } };
    }
    return { source: store, embeddings: provider ? store.cachedQueryProvider(provider, discoveryQueryBudget()) : undefined, relevance };
  }
  if (process.env.DISCOVERY_CATALOG_PATH) return { source: new JsonCatalogSource(process.env.DISCOVERY_CATALOG_PATH) };
  throw new Error("Discovery catalog is not configured");
}

/** Global paid query misses allowed per minute. Cache hits do not consume this budget. */
export function discoveryQueryBudget(env: Record<string, string | undefined> = process.env): number {
  const value = env.DISCOVERY_QUERY_EMBEDDINGS_PER_MINUTE ?? "60";
  if (!/^[1-9][0-9]{0,3}$/.test(value) || Number(value) > 1000) throw new Error("DISCOVERY_QUERY_EMBEDDINGS_PER_MINUTE must be 1 to 1000");
  return Number(value);
}

/** Release runtime connections for short-lived operators and deterministic integration tests. */
export async function closeConfiguredDiscovery(): Promise<void> {
  const current = store; store = undefined; relevance = undefined; await current?.close();
}
