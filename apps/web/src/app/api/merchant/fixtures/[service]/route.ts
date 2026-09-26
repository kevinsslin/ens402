import { serveMerchant } from "@ens402/server/merchant";
export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
import { fixtureDefinitions as fixtures, fixtureCall } from "@ens402/server/fixture-metadata";
/** Fixed demo data delivered only through the existing verified x402 settlement pipeline. */
export async function GET(request: Request, context: { params: Promise<{ service: string }> }) {
  const { service } = await context.params;
  if (!Object.hasOwn(fixtures, service)) return Response.json({ error: "Unknown fixture" }, { status: 404 });
  const fixture = fixtures[service as keyof typeof fixtures];
  try {
    const origin = process.env.MERCHANT_RESOURCE_URL;
    if (!origin) throw new Error("Merchant not configured");
    const url = new URL(`/api/merchant/fixtures/${service}`, origin).href;
    return await serveMerchant(request, "v1", { url, description: fixture.description, call: fixtureCall(service as keyof typeof fixtures), deliver: async () => ({ fixture: true, liveData: false, service, ...fixture.data }) });
  } catch { return Response.json({ error: "Fixture merchant unavailable. Reconcile any submitted authorization before paying again." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
