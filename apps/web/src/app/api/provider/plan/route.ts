import { planProvider, type ProviderSetup } from "@/server/provider-plan";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return new Response(null, { status: 403 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 8192)
    return new Response(null, { status: 413 });
  try {
    const result = await planProvider(JSON.parse(raw) as ProviderSetup);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error &&
          error.message.length < 300 &&
          !error.message.includes("http")
            ? error.message
            : "Provider planning unavailable",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
