import { after } from "next/server";
import { refreshConfiguredCatalog } from "../../../../../../indexer/src/refresh";
import { configuredDiscovery } from "@ens402/server/discovery-runtime";
import { DiscoveryNotReadyError, searchDiscovery } from "@ens402/server/discovery";
import { parseDiscoveryQuery, type DiscoveryQuery } from "@ens402/sdk/discovery";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
/** Public candidate catalog. Unconfigured ingestion returns 503, never fabricated listings. */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const params = new URL(request.url).searchParams;
  let query: DiscoveryQuery;
  try {
    for (const key of params.keys()) if (!["query", "paymentNetwork", "assetAddress", "maxPricePerRequestAtomic", "pageSize", "mode"].includes(key) || params.getAll(key).length !== 1) throw new Error();
    query = parseDiscoveryQuery({
      query: params.get("query") ?? undefined,
      paymentNetwork: params.get("paymentNetwork") ?? undefined,
      assetAddress: params.get("assetAddress") ?? undefined,
      maxPricePerRequestAtomic: params.get("maxPricePerRequestAtomic") ?? undefined,
      pageSize: params.has("pageSize") ? Number(params.get("pageSize")) : undefined,
      mode: (params.get("mode") ?? undefined) as DiscoveryQuery["mode"],
    });
  } catch { return Response.json({ error: "Invalid discovery query or filters." }, { status: 400, headers }); }
  let refreshing = false;
  const scheduleRefresh = () => {
    if (refreshing) return;
    refreshing = true;
    after(async () => {
      try { await refreshConfiguredCatalog(); }
      catch { console.error("discovery_refresh_failed: catalog preserved; check indexer configuration and RPC"); }
    });
  };
  try {
    const configured = configuredDiscovery();
    const source = { load: async (input?: DiscoveryQuery) => {
      const catalog = await configured.source.load(input);
      // Renew before the one-hour API/SDK freshness boundary. The database lease
      // prevents public traffic from starting concurrent refreshes across instances.
      if (Math.floor(Date.now() / 1000) - catalog.source.updatedAt > 1200) scheduleRefresh();
      return catalog;
    } };
    return Response.json(await searchDiscovery(query, { ...configured, source }), { headers });
  } catch (error) {
    if (refreshing) return Response.json({ code: "CATALOG_REFRESHING", error: "Updating service listings from ENS. Retry shortly." }, { status: 503, headers: { ...headers, "Retry-After": "5" } });
    if (error instanceof DiscoveryNotReadyError) return Response.json({ code: "CATALOG_NOT_READY", error: "The first catalog sync has not completed." }, { status: 503, headers });
    return Response.json({ code: "CATALOG_UNAVAILABLE", error: "Discovery catalog unavailable or stale." }, { status: 503, headers });
  }
}
