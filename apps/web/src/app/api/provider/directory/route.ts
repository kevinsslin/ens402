import { providerDirectory } from "@/server/provider-directory";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    return Response.json(await providerDirectory(new URL(request.url).searchParams.get("wallet") ?? ""), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Could not check your providers on Sepolia. Retry, or open a known provider in the dashboard." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
