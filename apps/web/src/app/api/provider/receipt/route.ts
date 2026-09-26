import { setupReceipt } from "@/server/setup-transaction";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const hash = new URL(request.url).searchParams.get("hash") ?? "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return Response.json({ error: "Invalid transaction hash" }, { status: 400 });
  try { return Response.json(await setupReceipt(hash), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Confirmation checks are busy. Your transaction is saved; check its status again shortly." }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "5" } }); }
}
