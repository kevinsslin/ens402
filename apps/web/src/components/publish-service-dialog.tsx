"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
import { RegistrationConsole } from "./registration-console";
import type { ProviderSetup } from "@/server/provider-plan";
export function PublishServiceDialog({
  provider,
  walletAddress,
  getToken,
  getProvider,
  onClose,
  onComplete,
}: {
  provider: string | null;
  walletAddress?: string;
  getToken: () => Promise<string | null>;
  getProvider: () => Promise<{
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  }>;
  onClose: () => void;
  onComplete: (name: string) => void;
}) {
  const [plan, setPlan] = useState<{
    ready: boolean;
    setup: ProviderSetup;
    registrationMode?: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    setPlan(null);
    setError("");
    setBusy(false);
    if (!provider) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const saved = JSON.parse(
          localStorage.getItem(`ens402-provider:${provider}`) || "null",
        );
        if (!saved || `${saved.label}.${saved.parent}` !== provider)
          throw Error(
            "Open this workspace's setup in the browser where you created it to recover its publishing configuration.",
          );
        const response = await fetch("/api/provider/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(saved),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(25000),
          ]),
        });
        const data = await response.json();
        if (!response.ok)
          throw Error(data.error || "Could not check publishing setup.");
        if (!controller.signal.aborted) setPlan(data);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Could not check publishing setup.",
          );
      }
    })();
    return () => controller.abort();
  }, [provider, walletAddress, retry]);
  return (
    <Dialog
      open={!!provider}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        scrollable
        className="sm:max-w-4xl"
        closeDisabled={busy}
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Publish service</DialogTitle>
          <DialogDescription className="break-all">
            Add an x402 endpoint to {provider}.
          </DialogDescription>
        </DialogHeader>
        {!plan && !error && (
          <p role="status" className="flex items-center gap-2 py-8">
            <Spinner />
            Checking publishing permissions…
          </p>
        )}
        {error && (
          <div role="alert" className="space-y-3 rounded-xl border p-4">
            <p>{error}</p>
            <Button variant="outline" onClick={() => setRetry((v) => v + 1)}>
              Retry
            </Button>
          </div>
        )}
        {plan &&
          (!plan.ready || !plan.setup.registrar || !plan.setup.resolver) && (
            <div className="space-y-3 rounded-xl border p-4">
              <p>This workspace needs to finish publishing setup first.</p>
              <Button asChild>
                <a
                  href={`/provider?provider=${encodeURIComponent(provider!)}&setup=1`}
                >
                  Continue workspace setup
                </a>
              </Button>
            </div>
          )}
        {plan?.ready && plan.setup.registrar && plan.setup.resolver && (
          <RegistrationConsole
            compact
            registrar={plan.setup.registrar}
            parent={provider!}
            direct={plan.registrationMode === "direct"}
            restricted
            shared={{
              resolver: plan.setup.resolver,
              ops: plan.setup.ops,
              treasury: plan.setup.treasury,
            }}
            walletAddress={walletAddress}
            getProvider={getProvider}
            getToken={getToken}
            onBusyChange={setBusy}
            onComplete={onComplete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
