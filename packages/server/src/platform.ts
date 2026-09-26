import { privy, getStore, createApproval, inspectService, executePurchase, resumeApproval, revokeApproval, walletBalance, cancelUnsentPurchase, reconcilePurchase, ensTransaction } from './index';
import { uuid } from './config';
import { prepareExternal, submitExternal } from './external';

export type Principal = { ownerId: string; kind: 'user' | 'agent'; approvalId?: string; token?: string };
export async function authenticate(header: string | null): Promise<Principal> {
  if (!header?.startsWith('Bearer ') || header.length > 8192) throw new Error('Sign in or provide an agent key');
  const token = header.slice(7);
  if (token.startsWith('ens402_')) {
    if (!/^ens402_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Invalid agent key');
    const key = await getStore().authenticateAgent(token);
    if (!key) throw new Error('Agent key expired or revoked');
    return {ownerId:key.owner_id,kind:'agent',approvalId:key.approval_id,token};
  }
  const claims = await privy().utils().auth().verifyAccessToken(token);
  return {ownerId:claims.user_id,kind:'user'};
}
export async function platformAction(principal: Principal, input: Record<string, unknown>) {
  const store = getStore();
  await store.rateLimit(principal.ownerId);
  const action = String(input.action);
  const assertApproval = async (value: unknown) => {
    const id = uuid(value);
    if (principal.kind === 'agent' && principal.approvalId !== id) throw new Error('Agent key does not cover this approval');
    return store.assertOwner(principal.ownerId,id);
  };
  const assertExecution = async () => { const e = await store.getExecution(uuid(input.id)); await assertApproval(e.approval_id); return e; };
  const guard = async () => {
    if (principal.kind === 'agent' && !(await store.authenticateAgent(principal.token!))) throw new Error('Agent key revoked');
  };
  if (principal.kind === 'agent' && !['inspect','execute','prepare-external','submit-external','execution','balance','cancel','reconcile'].includes(action)) throw new Error('This operation requires user login');
  switch(action) {
    case 'state':
      await store.releaseStaleReservations(principal.ownerId,Math.floor(Date.now()/1000));
      return {...await store.userState(principal.ownerId),names:(process.env.SERVICE_ENS_NAME || '').split(',').filter(Boolean)};
    case 'inspect': {
      if (principal.kind === 'agent') { const row = await assertApproval(principal.approvalId); if (input.name !== row.approval.name) throw new Error('Service is outside agent scope'); }
      return inspectService(input.name);
    }
    case 'approve': return createApproval(input,principal.ownerId);
    case 'resume-approval': await assertApproval(input.id); return resumeApproval(input.id);
    case 'revoke': await assertApproval(input.id); return revokeApproval(input.id);
    case 'balance': await assertApproval(input.id); return walletBalance(input.id);
    case 'execute': await assertApproval(input.approvalId); return executePurchase(input,guard);
    case 'prepare-external': await assertApproval(input.approvalId); return prepareExternal(input);
    case 'submit-external': await assertExecution(); return submitExternal(input,guard);
    case 'execution': return assertExecution();
    case 'cancel': await assertExecution(); return cancelUnsentPurchase(input.id);
    case 'reconcile': await assertExecution(); return reconcilePurchase(input);
    case 'create-key': {
      await assertApproval(input.approvalId);
      if (typeof input.label !== 'string' || input.label.trim().length < 1 || input.label.length > 80) throw new Error('Give the agent a short name');
      return store.createAgentKey(principal.ownerId,String(input.approvalId),input.label.trim());
    }
    case 'revoke-key': return store.revokeAgentKey(principal.ownerId,uuid(input.id));
    case 'ens': return ensTransaction({...input,action:input.operation});
    default: throw new Error('Unknown operation');
  }
}
