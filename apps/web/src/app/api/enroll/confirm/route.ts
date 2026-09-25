import { NextResponse } from 'next/server';
import { confirmEnrollment } from '@/lib/world';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    const body = await request.json() as { state?: string; signature?: string };
    if (!body.state || !body.signature || !/^0x[0-9a-fA-F]+$/.test(body.signature)) throw new Error('State and wallet signature required');
    return NextResponse.json({ authorizationUrl: await confirmEnrollment(body.state, body.signature as `0x${string}`) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Enrollment failed' }, { status: 400 });
  }
}
