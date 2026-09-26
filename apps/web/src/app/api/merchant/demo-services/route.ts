import {
  fixtureDefinitions,
  fixtureCall,
} from "@ens402/server/fixture-metadata";
export const dynamic = "force-dynamic";
export function GET() {
  const origin = process.env.MERCHANT_RESOURCE_URL;
  const payTo = process.env.MERCHANT_PAY_TO;
  if (!origin || !payTo)
    return Response.json(
      { error: "Demo services are not configured yet." },
      { status: 503 },
    );
  const amount = process.env.MERCHANT_PRICE_UNITS || "10000";
  return Response.json(
    {
      services: Object.entries(fixtureDefinitions).map(([id, fixture]) => ({
        id,
        description: fixture.description,
        endpoint: new URL(`/api/merchant/fixtures/${id}`, origin).href,
        payTo,
        amount,
        call: fixtureCall(id as keyof typeof fixtureDefinitions),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
