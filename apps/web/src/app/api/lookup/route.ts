import { NextResponse } from 'next/server';
import { createEnsClient, resolveServiceAuthority } from '@hufu402/sdk';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const name = new URL(request.url).searchParams.get('name');
    if (!name || name.length > 255) throw new Error('ENS service name required');
    if (!process.env.SEPOLIA_RPC_URL) throw new Error('SEPOLIA_RPC_URL is required');
    const authority = await resolveServiceAuthority(createEnsClient(process.env.SEPOLIA_RPC_URL), name);
    return NextResponse.json(authority, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Lookup failed' }, { status: 400 });
  }
}
