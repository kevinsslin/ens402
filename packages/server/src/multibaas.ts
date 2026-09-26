/** Read-only observations from a MultiBaas deployment indexing native ENSv2 events.
 * Source: https://docs.curvegrid.com/multibaas/api/list-events
 * Indexed events are historical activity, never authoritative current ENS state.
 */
export type EnsEventName = "LabelRegistered" | "EACRolesChanged" | "TextUpdated";
export type EnsContractKind = "Registry" | "Resolver";
export type MultiBaasEnsConfig = {
  /** Deployment origin, e.g. https://example.multibaas.com. */
  deploymentUrl: string;
  apiKey: string;
  contractAddress: string;
  contractKind: EnsContractKind;
};
export type IndexedEnsEvent = {
  kind: "multibaas_indexed_ens_event";
  authority: "observation_only";
  chainId: 11155111;
  contractKind: EnsContractKind;
  contractAddress: string;
  eventName: EnsEventName;
  txHash: string;
  blockNumber: number;
  logIndex: number;
  observedAt: string;
  inputs: Record<string, string>;
};
export type IndexedEnsEventsPage = {
  events: IndexedEnsEvent[];
  /** True when the bounded page was full; the caller may request the next offset. */
  hasMore: boolean;
  nextOffset: number;
};
export type IndexedEnsEventsOptions = {
  limit?: number;
  offset?: number;
  eventName?: EnsEventName;
};

type JsonRecord = Record<string, unknown>;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const ALLOWED_EVENTS: Record<EnsContractKind, readonly EnsEventName[]> = {
  Registry: ["LabelRegistered", "EACRolesChanged"],
  Resolver: ["TextUpdated", "EACRolesChanged"],
};

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord : null;
}

function parseEvent(value: unknown, config: MultiBaasEnsConfig): IndexedEnsEvent | null {
  const entry = record(value);
  const event = record(entry?.event);
  const transaction = record(entry?.transaction);
  const contract = record(event?.contract);
  if (!entry || !event || !transaction || !contract ||
      typeof contract.address !== "string" || contract.address.toLowerCase() !== config.contractAddress.toLowerCase()) {
    throw new Error("MultiBaas event contract mismatch");
  }
  if (!ALLOWED_EVENTS[config.contractKind].includes(event.name as EnsEventName)) return null;
  if (typeof transaction.txHash !== "string" || !TX_HASH.test(transaction.txHash) ||
      !Number.isSafeInteger(transaction.blockNumber) || Number(transaction.blockNumber) < 0 ||
      !Number.isSafeInteger(event.indexInLog) || Number(event.indexInLog) < 0 ||
      typeof entry.triggeredAt !== "string" || !Number.isFinite(Date.parse(entry.triggeredAt)) ||
      !Array.isArray(event.inputs)) {
    throw new Error("Invalid MultiBaas ENS event");
  }
  const inputs: Record<string, string> = {};
  for (const raw of event.inputs) {
    const field = record(raw);
    if (!field || typeof field.name !== "string" || !/^[A-Za-z][A-Za-z0-9_]*$/.test(field.name) ||
        (typeof field.value !== "string" && typeof field.value !== "number" && typeof field.value !== "boolean")) {
      throw new Error("Invalid MultiBaas ENS event input");
    }
    inputs[field.name] = String(field.value);
  }
  return {
    kind: "multibaas_indexed_ens_event", authority: "observation_only", chainId: 11155111,
    contractKind: config.contractKind, contractAddress: config.contractAddress.toLowerCase(),
    eventName: event.name as EnsEventName, txHash: transaction.txHash.toLowerCase(),
    blockNumber: Number(transaction.blockNumber), logIndex: Number(event.indexInLog),
    observedAt: entry.triggeredAt, inputs,
  };
}

export function createMultiBaasEnsEventReader(config: MultiBaasEnsConfig, fetcher: typeof fetch = fetch) {
  let deployment: URL;
  try { deployment = new URL(config.deploymentUrl); }
  catch { throw new Error("Invalid MultiBaas deployment URL"); }
  if (deployment.protocol !== "https:" || !deployment.hostname || deployment.username ||
      deployment.password || deployment.search || deployment.hash || deployment.pathname !== "/") {
    throw new Error("MultiBaas deployment URL must be an HTTPS origin");
  }
  if (!config.apiKey?.trim() || /[\r\n]/.test(config.apiKey)) throw new Error("Invalid MultiBaas API key");
  if (!ADDRESS.test(config.contractAddress)) throw new Error("Invalid ENS contract address");
  if (!Object.hasOwn(ALLOWED_EVENTS, config.contractKind)) throw new Error("Invalid ENS contract kind");

  async function getJson(url: URL): Promise<JsonRecord> {
    let response: Response;
    try {
      response = await fetcher(url, {
        method: "GET", headers: { Authorization: `Bearer ${config.apiKey}`, Accept: "application/json" },
        redirect: "error", signal: AbortSignal.timeout(10_000),
      });
    } catch { throw new Error("MultiBaas request failed"); }
    if (!response.ok) throw new Error(`MultiBaas request failed (${response.status})`);
    let body: unknown;
    try { body = await response.json(); }
    catch { throw new Error("Invalid MultiBaas response"); }
    const envelope = record(body);
    if (envelope?.status !== 200) throw new Error("Invalid MultiBaas response");
    return envelope;
  }

  return async function listIndexedEnsEvents(options: IndexedEnsEventsOptions = {}): Promise<IndexedEnsEventsPage> {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid MultiBaas page limit");
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid MultiBaas page offset");
    if (options.eventName && !ALLOWED_EVENTS[config.contractKind].includes(options.eventName)) {
      throw new Error("Event is not supported for this ENS contract");
    }
    // A MultiBaas deployment selects its own chain; never label another chain as Sepolia.
    const status = await getJson(new URL("/api/v0/chains/ethereum/status", deployment));
    if (record(status.result)?.chainID !== 11155111) throw new Error("MultiBaas deployment is not Ethereum Sepolia");
    const url = new URL("/api/v0/events", deployment);
    url.searchParams.set("contractAddress", config.contractAddress.toLowerCase());
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    const envelope = await getJson(url);
    if (!Array.isArray(envelope.result) || envelope.result.length > limit) {
      throw new Error("Invalid MultiBaas event page");
    }
    const events = envelope.result
      .map(value => parseEvent(value, config))
      .filter((value): value is IndexedEnsEvent => value !== null &&
        (options.eventName === undefined || value.eventName === options.eventName));
    return { events, hasMore: envelope.result.length === limit, nextOffset: offset + envelope.result.length };
  };
}
