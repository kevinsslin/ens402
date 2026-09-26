"use client";
import { Check, ArrowUpRight, AlertCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { Progress } from "./ui/progress";
import {
  setupChecklist,
  setupChecklistIndex,
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
}) {
  const busy = activity !== "idle",
    complete = phase === 3;
  const items = setupChecklist(parties ?? { ops: "", treasury: "" });
  const index = parties
    ? setupChecklistIndex(stepDescription, parties)
    : undefined;
  const current = index === undefined ? undefined : items[index];
  const completed = complete ? items.length : index;
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
            : "Compatible permission changes are grouped into one transaction. Confirm in your wallet; we continue automatically. Already configured items are skipped."}
        </p>
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Setup checklist</span>
          <span>
            {completed === undefined
              ? "Checking configuration"
              : `${completed} of ${items.length} configured`}
          </span>
        </div>
        <Progress
          className="mt-2 h-1.5"
          value={completed === undefined ? 0 : (completed / items.length) * 100}
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
            {index !== undefined && (
              <span className="ml-auto text-muted-foreground">
                Item {index + 1} / {items.length}
              </span>
            )}
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
          {actions && (
            <ul className="mt-4 space-y-2 rounded-lg bg-muted/40 p-4 text-sm">
              {actions.map((action, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-muted-foreground">{i + 1}.</span>
                  <span>{action}</span>
                </li>
              ))}
            </ul>
          )}
          {signer && (
            <p className="mt-3 break-all text-xs text-muted-foreground">
              Signed by {signerRole ?? "your wallet"} ·{" "}
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
                  ? "Review this permission in Rabby or your connected wallet."
                  : activity === "confirming"
                    ? "Submitted. Checking automatically before requesting the next signature."
                    : activity === "checking"
                      ? "Checking current on-chain permissions."
                      : "A new provider requires up to 16 transactions, including deployments and separate field permissions."}
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
        {phases.map((label, p) => (
          <details key={label} open={p === phase} className="py-4">
            <summary className="cursor-pointer text-sm font-medium">
              <span className="ml-1">{label}</span>
              <span className="float-right text-xs font-normal text-muted-foreground">
                {p < phase
                  ? "Complete"
                  : `${items.filter((i) => i.phase === p).length} items`}
              </span>
            </summary>
            <ol className="mt-3 space-y-2">
              {items.map(
                (item, i) =>
                  item.phase === p && (
                    <li
                      key={i}
                      aria-current={i === index ? "step" : undefined}
                      className={`flex items-center gap-3 rounded-md px-2 py-2 text-sm ${i === index ? "bg-muted font-medium" : "text-muted-foreground"}`}
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center text-xs">
                        {complete || (index !== undefined && i < index) ? (
                          <Check className="size-4 text-primary" />
                        ) : (
                          i + 1
                        )}
                      </span>
                      {item.title}
                    </li>
                  ),
              )}
            </ol>
          </details>
        ))}
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
