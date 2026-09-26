import { CheckCircle2, Circle, ShieldAlert } from "lucide-react";
import type { PaymentReceipt } from "@ens402/sdk/http";
import { USDC } from "@ens402/sdk";
import { usdc } from "./console-format";
const stages: Record<string, string> = {
  resolve: "Service found",
  "resolve-again": "ENS checked again",
  verify: "Payment checked",
  screen: "Recipient screened",
  sign: "Payment signed",
  submit: "Payment submitted",
  settle: "Payment confirmed",
  reconcile: "Payment reconciled",
  decision: "Decision",
  stop: "Stopped",
};
export function ReceiptDetails({
  receipt,
  attemptId,
}: {
  receipt: PaymentReceipt | null;
  attemptId: string;
}) {
  if (!receipt)
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        This attempt has not returned a decision yet. Refresh activity before
        retrying.
      </p>
    );
  const offered = receipt.requirement ?? receipt.offeredRequirements?.[0];
  const mismatch =
    offered &&
    receipt.service &&
    offered.payTo.toLowerCase() !== receipt.service.payment.payTo.toLowerCase();
  return (
    <div className="mt-5 space-y-5">
      <div className="grid gap-4 rounded-lg bg-muted/40 p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Requested price</p>
          <p className="mt-1 font-medium">
            {offered
              ? offered.asset.toLowerCase() === USDC.toLowerCase()
                ? `${usdc(offered.amount)} USDC`
                : `${offered.amount} raw token units`
              : "Not received"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Payment outcome</p>
          <p className="mt-1 font-medium">
            {["settled", "paid_delivery_failed"].includes(receipt.state)
              ? "Confirmed on Base Sepolia"
              : receipt.state === "uncertain"
                ? "Confirmation required"
                : "No payment submitted"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">ENS recipient</p>
          <p className="mt-2 break-all font-mono text-xs">
            {receipt.service?.payment.payTo ?? "Not available"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">
            HTTP 402 recipient {mismatch ? "· Does not match" : ""}
          </p>
          <p
            className={`mt-2 break-all font-mono text-xs ${mismatch ? "text-destructive" : ""}`}
          >
            {offered?.payTo ?? "Not received"}
          </p>
        </div>
      </div>
      {!!receipt.offeredRequirements &&
        receipt.offeredRequirements.length > 1 && (
          <p className="text-xs text-muted-foreground">
            The first offered option is shown. None of the offered options
            passed verification.
          </p>
        )}
      <ol className="space-y-3">
        {receipt.steps.map((step, i) => {
          const stopped =
            ["stop", "decision"].includes(step.stage) ||
            (step.stage === "verify" && receipt.state === "rejected");
          const Icon = stopped
            ? ShieldAlert
            : step.stage === "submit"
              ? Circle
              : CheckCircle2;
          return (
            <li key={i} className="flex gap-3 text-sm">
              <Icon
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div>
                <p className="font-medium">
                  {stages[step.stage] ?? "Payment update"}
                </p>
                <p className="mt-1 leading-6 text-muted-foreground">
                  {step.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {receipt.settlement && (
        <a
          className="inline-block text-sm text-primary underline"
          href={`https://sepolia.basescan.org/tx/${receipt.settlement.transaction}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction ↗
        </a>
      )}
      {receipt.resource && (
        <details>
          <summary className="cursor-pointer text-sm">Service response</summary>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 p-4 text-xs">
            {receipt.resource}
          </pre>
        </details>
      )}
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">
          Verification details
        </summary>
        <p className="mt-3 break-all font-mono text-xs">Attempt {attemptId}</p>
        <p className="mt-2 text-xs">
          ENS block {receipt.service?.block ?? "unavailable"}
        </p>
      </details>
    </div>
  );
}
