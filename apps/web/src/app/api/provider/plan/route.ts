import { prepareSetupStep } from "@/server/setup-transaction";
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
    const input = JSON.parse(raw) as ProviderSetup & { prepare?: boolean };
    const { prepare, ...setup } = input;
    const result = await planProvider(setup);
    if (prepare && result.transactions[0]) {
      result.transactions[0] = await prepareSetupStep(result.transactions[0]);
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const throttled = error instanceof Error && /rate.?limit|429|too many requests/i.test(error.message);
    return Response.json(
      {
        error: throttled ? "Sepolia RPC providers are busy. Your setup is saved. Wait a moment, then continue this step." :
          error instanceof Error &&
          error.message.length < 300 &&
          !error.message.includes("http")
            ? error.message
            : "Provider planning unavailable",
      },
      { status: throttled ? 503 : 400, headers: { "Cache-Control": "no-store", ...(throttled ? { "Retry-After": "5" } : {}) } },
    );
  }
}
