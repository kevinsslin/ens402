import { NextResponse } from 'next/server';
import { beginEnrollment } from '@/lib/world';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const body = await request.json() as { wallet?: string; returnTo?: string };
    return NextResponse.json(await beginEnrollment(body.wallet ?? '', body.returnTo));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Enrollment failed' }, { status: 400 });
  }
}
