import { resumeApproval, authorized, cancelUnsentPurchase, walletBalance, createApproval, ensTransaction, executePurchase, getStore, inspectService, reconcilePurchase, revokeApproval } from '@ens402/server';
export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  if (!authorized(request.headers.get('authorization'))) return Response.json({ error: 'A valid demo access token is required.' }, { status: 401 });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'Expected JSON.' }, { status: 415 });
  let raw = '';
  const reader = request.body?.getReader();
  if (reader) {
    let bytes = 0;
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 16384) return Response.json({ error: 'Request too large.' }, { status: 413 });
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } catch { return Response.json({ error: 'Invalid request body.' }, { status: 400 }); }
    finally { await reader.cancel().catch(() => {}); }
  }
  let input: Record<string,unknown>;
  try { input = JSON.parse(raw); if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error(); }
  catch { return Response.json({ error: 'Invalid request.' }, { status: 400 }); }
  try {
    let result: unknown;
    switch (input.action) {
      case 'state': result = { names: (process.env.SERVICE_ENS_NAME || '').split(',').filter(Boolean), approvals: await getStore().listApprovals(), executions: await getStore().listExecutions() }; break;
      case 'resume-approval': result = await resumeApproval(input.id); break;
      case 'cancel': result = await cancelUnsentPurchase(input.id); break;
      case 'balance': result = await walletBalance(input.id); break;
      case 'inspect': result = await inspectService(input.name); break;
      case 'approve': result = await createApproval(input); break;
      case 'revoke': result = await revokeApproval(input.id); break;
      case 'execute': result = await executePurchase(input); break;
      case 'reconcile': result = await reconcilePurchase(input); break;
      case 'ens': result = await ensTransaction({ ...input, action: input.operation }); break;
      default: return Response.json({ error: 'Unknown operation.' }, { status: 400 });
    }
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Provider exceptions can contain credential-bearing RPC URLs. Never echo them.
    return Response.json({ error: 'Operation could not complete. Check setup, current approval, balance and permissions. Refresh the activity list before retrying a payment.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  }
}
