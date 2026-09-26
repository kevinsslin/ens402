import { analyticsReport } from "@ens402/server/analytics-runtime";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const providerName = query.get("provider") || "";
    if (!/^[a-z0-9.-]+\.eth$/.test(providerName) || providerName.length > 255)
      return Response.json(
        { error: "Use a provider ENS name" },
        { status: 400 },
      );
    const days = Number(query.get("days") || 30);
    if (!Number.isInteger(days) || days < 1 || days > 365)
      return Response.json(
        { error: "Window must be 1 to 365 days" },
        { status: 400 },
      );
    const until = Math.floor(Date.now() / 1000);
    return Response.json(
      await analyticsReport({
        providerName,
        since: until - days * 86400,
        until,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Address analytics is not available yet. Ingestion and observation coverage must be configured.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
