import { readiness } from '@ens402/server';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json(readiness(), { headers: { 'Cache-Control': 'no-store' } }); }
