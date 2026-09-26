import { planPlatform, type PlatformSetup } from "@/server/platform-plan";
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
    const result = await planPlatform(JSON.parse(raw) as PlatformSetup);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error &&
          error.message.length < 300 &&
          !error.message.includes("http")
            ? error.message
            : "Platform planning unavailable",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
