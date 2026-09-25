import { NextResponse } from 'next/server';
import { getDecisionReceipt } from '@/lib/decision';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid receipt ID' }, { status: 400 });
  try {
    const receipt = await getDecisionReceipt(id);
    if (!receipt) return NextResponse.json({ error: 'Decision receipt not found' }, { status: 404 });
    return NextResponse.json(receipt, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Decision receipt unavailable' }, { status: 503 });
  }
}
