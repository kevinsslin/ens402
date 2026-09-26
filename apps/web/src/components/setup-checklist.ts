export type SetupParties = { ops: string; treasury: string; registrar?: string };
const fields = [
  ["agent-endpoint[x402]", "API endpoint"], ["description", "Description"],
  ["avatar", "Service image"], ["ens402.call", "Call schema"],
  ["ens402.payment", "Payment terms"], ["ens402.status", "Listing status"],
] as const;
export function setupChecklist(parties: SetupParties) {
  return [
    { phase: 0, title: "Create provider directory", purpose: "Deploy the registry that holds your service names." },
    { phase: 0, title: "Connect provider name", purpose: "Point your provider name to its service registry." },
    { phase: 1, title: "Create shared settings", purpose: "Deploy the resolver that stores your services' public configuration." },
    ...fields.slice(0,4).map(([key,label])=>({phase:1,title:`Operations · ${label}`,key,recipient:"Operations wallet",address:parties.ops,purpose:`Allow Operations to update ${label.toLowerCase()} across this provider's services.`})),
    {phase:1,title:"Treasury Admin · Payment terms",key:"ens402.payment",recipient:"Treasury Admin",address:parties.treasury,purpose:"Allow Treasury Admin to update pricing, network and asset settings across this provider's services."},
    {phase:2,title:"Create service publisher",purpose:"Deploy the restricted contract that registers services and initializes their records."},
    ...fields.map(([key,label])=>({phase:2,title:`Publisher · ${label}`,key,recipient:"Service publisher contract",address:parties.registrar,purpose:`Allow the publisher contract to write the initial ${label.toLowerCase()} when registering a new service. Its code rejects existing record bundles.`})),
    {phase:2,title:"Enable service registration",recipient:"Service publisher contract",address:parties.registrar,key:"ROLE_REGISTRAR",purpose:"Allow the publisher contract to register new service names under this provider."},
  ];
}
export function setupChecklistIndex(description: string, parties: SetupParties): number | undefined {
  if(description === "Create provider registry") return 0;
  if(description.startsWith("Register provider")) return 1;
  if(description.startsWith("Deploy shared")) return 2;
  if(description.startsWith("Deploy restricted")) return 8;
  if(description.startsWith("Grant ROLE_REGISTRAR")) return 15;
  const match=description.match(/^Grant (\S+) writer across this provider resolver to (0x[\da-fA-F]{40})$/);
  if(!match?.[1] || !match[2])return undefined;
  const field=fields.findIndex(([key])=>key===match[1]);
  const account=match[2].toLowerCase();
  if(account===parties.ops.toLowerCase()&&field>=0&&field<4)return 3+field;
  if(account===parties.treasury.toLowerCase()&&field===4)return 7;
  if(account===parties.registrar?.toLowerCase()&&field>=0)return 9+field;
  return undefined;
}

export type ChecklistTransaction = { description: string; actions?: string[] };
/** Only mark the inspected phase and earlier phases complete; later phases have not been checked yet. */
export function setupChecklistState(phase: number, transactions: ChecklistTransaction[], parties: SetupParties) {
  const remaining = new Set(transactions.flatMap(step => step.actions ?? [step.description])
    .map(description => setupChecklistIndex(description, parties))
    .filter((index): index is number => index !== undefined));
  const deploymentPending = [0, 2, 8].some(index => remaining.has(index));
  return setupChecklist(parties).map((item, index) =>
    phase === 3 || item.phase < phase ? "complete" as const
      : item.phase > phase || deploymentPending || remaining.has(index) ? "pending" as const
      : "complete" as const);
}
