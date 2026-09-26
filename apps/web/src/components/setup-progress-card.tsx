"use client";
import { Check, ArrowUpRight, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { Progress } from "./ui/progress";
import {
  setupChecklist,
  setupChecklistIndex,
  setupChecklistState,
  type ChecklistTransaction,
  type SetupParties,
} from "./setup-checklist";
export type SetupActivity = "idle" | "checking" | "wallet" | "confirming";
const phases = ["Provider directory", "Team permissions", "Service publisher"];
export function SetupProgressCard({
  phase,
  activity,
  title,
  description,
  actionLabel,
  signer,
  signerRole,
  hash,
  message,
  error,
  disabled,
  onContinue,
  onEdit,
  parties,
  actions,
  transactions = [],
  stepDescription = "",
}: {
  phase: number;
  activity: SetupActivity;
  title: string;
  description: string;
  actionLabel: string;
  signer?: string;
  signerRole?: string;
  hash?: string;
  message?: string;
  error?: boolean;
  disabled: boolean;
  onContinue: () => void;
  onEdit?: () => void;
  parties?: SetupParties;
  stepDescription?: string;
  actions?: string[];
  transactions?: ChecklistTransaction[];
}) {
  const busy = activity !== "idle",
    complete = phase === 3;
  const items = setupChecklist(parties ?? { ops: "", treasury: "" });
  const index = parties
    ? setupChecklistIndex(stepDescription, parties)
    : undefined;
  const isBatch = (actions?.length ?? 0) > 1;
  const current = isBatch || index === undefined ? undefined : items[index];
  const states = setupChecklistState(phase, transactions, parties ?? { ops: "", treasury: "" });
  const completed = phases.filter((_, p) => items.every((item, i) => item.phase !== p || states[i] === "complete")).length;
  const status =
    activity === "wallet"
      ? "Confirm in your wallet"
      : activity === "confirming"
        ? "Waiting for confirmation"
        : "Preparing next transaction";
  return (
    <section
      id="provider-setup-progress"
      aria-label="Provider setup progress"
      className="mt-6 scroll-mt-28 overflow-hidden rounded-2xl border bg-card"
    >
      <header className="border-b px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-sans text-xl font-semibold tracking-normal">
            {complete ? "Your provider is ready" : "Set up your provider"}
          </h2>
          <span className="shrink-0 text-xs text-muted-foreground">
            Sepolia
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {complete
            ? "Your directory, team permissions and publisher are configured."
            : "Each transaction card is one wallet confirmation. Permissions inside a batch are applied together."}
        </p>
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Configuration progress</span>
          <span>
            {completed} of {phases.length} stages complete
          </span>
        </div>
        <Progress
          className="mt-2 h-1.5"
          value={(completed / phases.length) * 100}
          aria-label="Provider configuration progress"
        />
      </header>
      {!complete && (
        <div className="border-b px-6 py-5">
          <div className="flex items-center gap-2 text-xs font-medium text-primary">
            {busy && <Spinner className="size-4 setup-progress-spinner" />}
            <span>
              {error
                ? "Setup paused"
                : busy
                  ? status
                  : "Ready for your approval"}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold">
            {current?.title ?? title}
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {current?.purpose ?? description}
          </p>
          {current && "recipient" in current && (
            <dl className="mt-4 grid gap-3 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-[120px_1fr]">
              <dt className="text-muted-foreground">Receives access</dt>
              <dd>
                <span className="font-medium">{current.recipient}</span>
                {current.address && (
                  <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">
                    {current.address}
                  </span>
                )}
              </dd>
              <dt className="text-muted-foreground">Permission</dt>
              <dd className="font-mono text-xs leading-5">
                {current.key === "ROLE_REGISTRAR"
                  ? "ROLE_REGISTRAR"
                  : `ROLE_SET_TEXT · ${current.key}`}
              </dd>
              <dt className="text-muted-foreground">Scope</dt>
              <dd>
                {current.key === "ROLE_REGISTRAR"
                  ? "New service names in your provider registry"
                  : "This field across the provider's shared resolver"}
              </dd>
            </dl>
          )}
          {actions && actions.length > 1 && <p className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm font-medium text-primary">{actions.length} permission updates · 1 wallet confirmation</p>}
          {signer && (
            <p className="mt-3 break-all text-xs text-muted-foreground">
              Signer: {signerRole ?? "your wallet"} ·{" "}
              <span className="font-mono">{signer}</span>
            </p>
          )}
          <div role="status" aria-live="polite" className="mt-4 text-sm">
            {error && message ? (
              <p className="flex items-start gap-2 text-amber-800">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {message}
              </p>
            ) : (
              <p className="text-muted-foreground">
                {activity === "wallet"
                  ? "Review this transaction in your connected wallet."
                  : activity === "confirming"
                    ? "Submitted. Checking automatically before requesting the next signature."
                    : activity === "checking"
                      ? "Checking current on-chain permissions."
                      : "One confirmation applies all permissions in this transaction. Completed permissions are skipped automatically."}
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            {!busy && (
              <Button disabled={disabled} onClick={onContinue}>
                {error ? "Resume setup" : actionLabel}
              </Button>
            )}
            {hash && (
              <a
                className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4"
                href={`https://sepolia.etherscan.io/tx/${hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction
                <ArrowUpRight className="size-3" />
              </a>
            )}
          </div>
        </div>
      )}
      <div className="divide-y px-6">
        {phases.map((label, p) => {
          const phaseItems = items.map((item, i) => ({ ...item, state: states[i] })).filter(item => item.phase === p);
          const phaseComplete = phaseItems.every(item => item.state === "complete");
          // The plan already contains native multicall batches. Never split them into numbered steps.
          const phaseTransactions = transactions.filter(step => {
            const indices = (step.actions ?? [step.description]).map(action => setupChecklistIndex(action, parties ?? { ops: "", treasury: "" }));
            return indices.some(i => i !== undefined && items[i]?.phase === p)
              || (indices.every(i => i === undefined) && p === phase);
          });
          const activePhase = p === phase && !complete;
          return (
            <div key={label} className="py-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                {activePhase && busy ? <Spinner className="size-4" /> : phaseComplete ? <Check aria-label="Complete" className="size-4 text-primary" /> : <span className="size-4 rounded-full border" />}
                {label}
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {activePhase && busy ? status : phaseComplete ? "Complete" : "Pending"}
                </span>
              </div>
              {phaseTransactions.length > 0 && !complete && (
                <ul className="mt-3 space-y-3">
                  {phaseTransactions.map((step) => {
                    const active = step.description === stepDescription;
                    const labels = (step.actions ?? [step.description]).map(action => {
                      const i = setupChecklistIndex(action, parties ?? { ops: "", treasury: "" });
                      return i === undefined ? action : items[i]!.title;
                    });
                    return (
                      <li key={step.description} aria-current={active ? "step" : undefined} aria-busy={active && busy} className={`rounded-xl border p-4 ${active ? "border-primary/30 bg-primary/5" : "bg-muted/20"}`}>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {active && busy && <Spinner className="size-4 shrink-0" />}
                          <span>{step.actions?.length ? `${step.actions.length} permission updates` : labels[0]}</span>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">1 transaction</span>
                        </div>
                        {step.actions && <ul className="mt-3 flex flex-wrap gap-2">{labels.map(label => <li key={label} className="rounded-md bg-background px-2 py-1 text-xs text-muted-foreground">{label}</li>)}</ul>}
                        <p className="mt-3 text-xs text-muted-foreground">{active ? error ? "Paused. Review the message above." : busy ? status : "Ready for one wallet confirmation" : "Queued"}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!phaseComplete && phaseTransactions.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{activePhase ? "Checking the next transaction…" : "Prepared after the previous stage completes."}</p>}
            </div>
          );
        })}
      </div>
      {complete && (
        <div role="status" className="border-t px-6 py-5">
          <p className="text-sm text-muted-foreground">
            All setup stages complete.
          </p>
          <Button asChild className="mt-4">
            <a href="#publish-first-service">Publish your first service</a>
          </Button>
        </div>
      )}
      {onEdit && !busy && !hash && !complete && (
        <div className="border-t px-6 py-3">
          <button
            onClick={onEdit}
            className="text-xs text-muted-foreground underline"
          >
            Edit provider details
          </button>
        </div>
      )}
    </section>
  );
}
