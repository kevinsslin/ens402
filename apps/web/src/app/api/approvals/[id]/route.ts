import { NextResponse } from 'next/server';
import { database } from '@/lib/db';

export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid approval ID' }, { status: 400 });
  const result = await database().query<{ status: string; first_approved: boolean; expires_at: Date }>(
    `SELECT status,(first_subject IS NOT NULL) AS first_approved,expires_at
     FROM approvals WHERE id=$1`, [id],
  );
  if (!result.rows[0]) return NextResponse.json({ error: 'Approval not found' }, { status: 404 });
  const approval = result.rows[0];
  const status = approval.status === 'pending' && approval.expires_at.getTime() <= Date.now()
    ? 'expired' : approval.status;
  return NextResponse.json({ status, firstApproved: approval.first_approved,
    expiresAt: approval.expires_at.toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
