import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q')?.slice(0, 100) ?? '';
  const url = new URL('https://api.cdp.coinbase.com/platform/v2/x402/discovery/search');
  url.search = new URLSearchParams({ query, network: 'eip155:84532', limit: '10' }).toString();
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Bazaar returned HTTP ${response.status}`);
    return NextResponse.json(await response.json(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Discovery failed' }, { status: 502 });
  }
}
