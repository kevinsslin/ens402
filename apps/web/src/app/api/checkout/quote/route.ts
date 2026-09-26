import { inspectService, screenRecipient, getStore } from "@ens402/server";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
/** Public read-only payment preflight. Never creates a wallet, approval or signature. */
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 1024) return Response.json({ error: "Request too large" }, { status: 413, headers });
  let name: string;
  try {
    const input = JSON.parse(raw);
    if (Object.keys(input).some(key => key !== "name") || typeof input.name !== "string" || !/^[a-z0-9.-]+\.eth$/.test(input.name) || input.name.length > 255) throw Error();
    name = input.name;
  } catch { return Response.json({ error: "Provide a service ENS name" }, { status: 400, headers }); }
  try { await getStore().rateLimit("public-checkout-quote", 60); }
  catch { return Response.json({ error: "Preflight busy; retry shortly" }, { status: 429, headers }); }
  try {
    const service = await inspectService(name);
    const evidence = await screenRecipient(service.payment.payTo);
    return Response.json({ service, evidence }, { headers });
  } catch {
    return Response.json({ error: "Could not verify ENS or recipient screening. No payment was performed." }, { status: 503, headers });
  }
}
