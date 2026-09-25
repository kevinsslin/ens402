import { serveMerchant } from '@ens402/server/merchant';
export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { return await serveMerchant(request, 'v2'); }
  catch { return Response.json({ error: 'Merchant or settlement service unavailable. Reconcile any submitted authorization before paying again.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
