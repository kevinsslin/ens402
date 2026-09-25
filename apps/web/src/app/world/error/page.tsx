import { FlowOutcome } from '@/components/flow-outcome';
export default function WorldError() { return <FlowOutcome label="NO AUTHORIZATION GRANTED" title="World verification did not complete." description="This attempt did not authorize a payment or create a grant. Return to the original approval link to try again." success={false} actionHref="/" actionLabel="Back to HuFu"/>; }
