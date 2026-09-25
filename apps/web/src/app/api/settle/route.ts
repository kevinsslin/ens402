import { NextResponse } from 'next/server';
import { recordSettlement } from '@/lib/policy';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    return NextResponse.json(await recordSettlement(await request.json()), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Settlement update failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
