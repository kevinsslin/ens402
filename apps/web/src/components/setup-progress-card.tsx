"use client";
import { Check, Circle, Loader2, ArrowUpRight, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
export type SetupActivity = "idle" | "checking" | "wallet" | "confirming";
const stages = [
  { title: "Register your provider", description: "Create your directory and connect its ENS name." },
  { title: "Set up service permissions", description: "Give Operations and Treasury Admin their own controls." },
  { title: "Enable publishing", description: "Prepare your contract to register services." },
];
export function SetupProgressCard({ phase, activity, title, description, actionLabel, signer, signerRole, hash, message, error, disabled, onContinue, onEdit }: {
  phase: number; activity: SetupActivity; title: string; description: string; actionLabel: string;
  signer?: string; signerRole?: string; hash?: string; message?: string; error?: boolean;
  disabled: boolean; onContinue: () => void; onEdit?: () => void;
}) {
  const busy = activity !== "idle";
  const activityLabel = activity === "wallet" ? "Confirm in your wallet" : activity === "confirming" ? "Waiting for Sepolia" : "Checking your setup";
  return <section id="provider-setup-progress" aria-label="Provider setup progress" className="mt-6 scroll-mt-28 overflow-hidden rounded-3xl border border-primary/20 bg-white shadow-[0_12px_48px_-24px_rgba(0,84,204,0.25)]">
    <div className="border-b bg-primary/[0.03] px-6 py-6 sm:px-8">
      <p className="text-xs font-medium uppercase tracking-wider text-primary">One-time setup · Sepolia</p>
      <h2 className="mt-2 text-3xl">{phase === 3 ? "Your provider is ready" : "Set up your provider"}</h2>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{phase === 3 ? "Setup is complete. Publish your first service below." : "Complete these three stages. Some stages require more than one transaction. Your progress is saved after each submission."}</p>
    </div>
    <ol className="px-6 py-6 sm:px-8">
      {stages.map((stage,index) => {
        const done=index<phase, active=index===phase;
        return <li key={stage.title} className={`relative flex gap-4 pb-7 last:pb-0 ${!done && !active ? "text-muted-foreground" : ""}`}>
          {index<2 && <span aria-hidden="true" className={`absolute left-3.5 top-8 h-[calc(100%-2rem)] w-px ${done ? "bg-primary/40" : "bg-border"}`} />}
          <span className={`relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-white ${done || active ? "text-primary" : "text-slate-300"}`}>
            {done ? <Check className="size-6" aria-label="Complete" /> : active && busy ? <Loader2 className="size-6 animate-spin" aria-label="In progress" /> : <Circle className="size-6" aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-sans text-base font-semibold">{stage.title}</h3><span className={`text-xs font-medium ${done || active ? "text-primary" : "text-muted-foreground"}`}>{done ? "Done" : active ? busy ? "In progress" : hash ? "Submitted" : "Current step" : "Next"}</span></div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{stage.description}</p>
            {active && <div className="mt-4 rounded-2xl border border-primary/10 bg-slate-50/70 p-4 sm:p-5">
              <p className="text-sm font-semibold">{title}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              {signer && <p className="mt-3 break-all text-xs text-muted-foreground">{signerRole || "Signing wallet"}: <span className="font-mono">{signer}</span></p>}
              <div role="status" aria-live="polite" className="mt-4">
                {busy && <p className="flex items-center gap-2 text-sm font-medium text-primary"><Loader2 className="size-4 animate-spin" aria-hidden="true" />{activityLabel}</p>}
                {message && <p className={`mt-2 text-sm leading-6 ${error ? "text-amber-800" : "text-muted-foreground"}`}>{error && <AlertCircle className="mr-1 inline size-4" aria-hidden="true" />}{message}</p>}
              </div>
              {hash && <a className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-4" href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noreferrer">View submitted transaction <ArrowUpRight className="size-3" /></a>}
              <Button disabled={disabled || busy} className="mt-5 w-full sm:w-auto" onClick={onContinue}>{busy ? activityLabel : actionLabel}</Button>
            </div>}
          </div>
        </li>;
      })}
    </ol>
    {phase===3 && <div role="status" className="border-t px-6 py-5 text-sm font-medium text-primary sm:px-8">All setup stages complete.<Button asChild className="mt-4 w-full"><a href="#publish-first-service">Publish your first service</a></Button></div>}
    {onEdit && !busy && !hash && phase<3 && <div className="border-t px-6 py-4 sm:px-8"><button onClick={onEdit} className="text-xs text-muted-foreground underline underline-offset-4">Back to provider details</button></div>}
  </section>;
}
