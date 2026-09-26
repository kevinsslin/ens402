import { configuredDiscovery } from "@ens402/server/discovery-runtime";
import { DiscoveryNotReadyError, searchDiscovery } from "@ens402/server/discovery";
import { parseDiscoveryQuery, type DiscoveryQuery } from "@ens402/sdk/discovery";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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
  try {
    return Response.json(await searchDiscovery(query, configuredDiscovery()), { headers });
  } catch (error) {
    if (error instanceof DiscoveryNotReadyError) return Response.json({ code: "CATALOG_NOT_READY", error: "The first catalog sync has not completed." }, { status: 503, headers });
    return Response.json({ code: "CATALOG_UNAVAILABLE", error: "Discovery catalog unavailable or stale." }, { status: 503, headers });
  }
}
