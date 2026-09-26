import { serveMismatch } from '@ens402/server/merchant';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try { return serveMismatch(request); }
  catch { return Response.json({error:'Demo endpoint unavailable'},{status:503}); }
}
