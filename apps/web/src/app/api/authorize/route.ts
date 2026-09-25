import { NextResponse } from 'next/server';
import { authorizePayment } from '@/lib/policy';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const result = await authorizePayment(await request.json());
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authorization failed';
    return NextResponse.json({ allowed: false, reason: message }, { status: 400 });
  }
}
