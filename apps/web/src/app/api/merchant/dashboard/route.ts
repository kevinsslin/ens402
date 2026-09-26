import { merchantDashboard } from "@/server/merchant-dashboard";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  try {
    return Response.json(
      await merchantDashboard(
        query.get("provider") ?? "",
        query.get("wallet") ?? "",
        query.get("service") ?? undefined,
        query.get("resolver") ?? undefined,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error &&
          error.message.length < 300 &&
          !error.message.includes("http")
            ? error.message
            : "Provider lookup unavailable",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
