import { FlowOutcome } from '@/components/flow-outcome';
export default function EnrollDone() { return <FlowOutcome label="ENROLLMENT COMPLETE" title="Your agent is bound." description="Return to the agent and retry the payment. New payees will request approval for the exact payment and a standing grant." success actionHref="/" actionLabel="Back to HuFu"/>; }
