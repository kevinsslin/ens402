import { NextResponse } from 'next/server';
import { beginApproval } from '@/lib/world';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('approval');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Approval ID required');
    const action = url.searchParams.get('action') === 'deny' ? 'deny' : 'approve';
    const destination = await beginApproval(id, url.searchParams.get('invite') ?? undefined, action);
    return NextResponse.redirect(destination);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'World approval failed' }, { status: 400 });
  }
}
