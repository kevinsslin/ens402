import { PageHeading } from '@/components/page-heading';
import { enrollmentRedirectPath } from '@/lib/world';
import EnrollClient from './enroll-client';
export default async function EnrollPage({ searchParams }: { searchParams: Promise<{ wallet?: string; returnTo?: string }> }) {
  const { wallet, returnTo } = await searchParams;
  let redirectPath = '/enroll/done';
  try { redirectPath = enrollmentRedirectPath(returnTo); } catch { /* Ignore an invalid return link. */ }
  const secondApprover = redirectPath !== '/enroll/done';
  return <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20"><PageHeading
    label={secondApprover ? 'SECOND APPROVER' : 'AGENT OWNER'}
    title={secondApprover ? 'Enroll your own wallet.' : 'Enroll your payer.'}
    description={secondApprover
      ? 'Verify a wallet you control with World, then return to the payment invitation. Your identity must differ from the first approver.'
      : "Bind an agent's payment wallet to a World-verified owner. That owner can approve new payees and manage the agent's daily limit."}
  /><EnrollClient suggestedWallet={wallet ?? ''} returnTo={redirectPath} secondApprover={secondApprover}/></div>;
}
