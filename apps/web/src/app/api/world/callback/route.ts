import { NextResponse } from 'next/server';
import { finishWorldFlow } from '@/lib/world';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state || !code || url.searchParams.has('error')) return NextResponse.redirect(new URL('/world/error', url.origin));
  try {
    const path = await finishWorldFlow(state, code);
    return NextResponse.redirect(new URL(path, url.origin));
  } catch {
    return NextResponse.redirect(new URL('/world/error', url.origin));
  }
}
