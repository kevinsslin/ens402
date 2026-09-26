import { serveMerchant } from "@ens402/server/merchant";
export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
const fixtures = {
  weather: { description: "Demo fixture: Tokyo weather forecast", data: { city: "Tokyo", temperatureC: 24, condition: "Partly cloudy" } },
  fx: { description: "Demo fixture: USD to JPY exchange rate", data: { base: "USD", quote: "JPY", rate: "145.25" } },
  research: { description: "Demo fixture: concise agent payment research", data: { title: "Agent payment verification", summary: "Compare current ENS payment terms with HTTP 402 before signing.", sources: ["https://www.x402.org/"] } },
};
/** Fixed demo data delivered only through the existing verified x402 settlement pipeline. */
export async function GET(request: Request, context: { params: Promise<{ service: string }> }) {
  const { service } = await context.params;
  if (!Object.hasOwn(fixtures, service)) return Response.json({ error: "Unknown fixture" }, { status: 404 });
  const fixture = fixtures[service as keyof typeof fixtures];
  try {
    const origin = process.env.MERCHANT_RESOURCE_URL;
    if (!origin) throw new Error("Merchant not configured");
    const url = new URL(`/api/merchant/fixtures/${service}`, origin).href;
    return await serveMerchant(request, "v1", { url, description: fixture.description, deliver: async () => ({ fixture: true, liveData: false, service, ...fixture.data }) });
  } catch { return Response.json({ error: "Fixture merchant unavailable. Reconcile any submitted authorization before paying again." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
