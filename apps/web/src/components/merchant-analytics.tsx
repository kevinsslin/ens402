"use client";
import { useState } from "react";
import { formatUnits } from "viem";
import type { AnalyticsReport } from "@ens402/server/analytics";
import { Button } from "./ui/button";
export function MerchantAnalytics({ provider }: { provider: string }) {
  const [report, setReport] = useState<AnalyticsReport | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/merchant/analytics?provider=${encodeURIComponent(provider)}&days=30`,
      );
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setReport(data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Analytics unavailable",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-10 border-t pt-8">
      <h2 className="text-2xl">Observed receipts</h2>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Last 30 days on Base Sepolia. Shared recipients appear once; these
        totals are not exact endpoint revenue or profit.
      </p>
      <Button variant="outline" className="mt-4" disabled={busy} onClick={load}>
        Load address analytics
      </Button>
      {error && (
        <p role="status" className="mt-4 text-sm">
          {error}
        </p>
      )}
      {report && (
        <>
          <p className="mt-4 text-xs text-muted-foreground">
            {new Date(report.window.since * 1000).toLocaleDateString()} to{" "}
            {new Date(report.window.until * 1000).toLocaleDateString()} ·
            Finalized block {report.checkpoint?.blockNumber ?? "not ingested"}
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {report.groups.map((group) => (
              <article key={group.payTo} className="rounded-xl border p-5">
                <h3 className="break-all font-mono text-xs">{group.payTo}</h3>
                <p className="mt-2 break-words text-sm">
                  {group.services.join(", ")}
                </p>
                <p className="mt-3 text-lg">
                  {formatUnits(
                    BigInt(group.total.amountAtomic),
                    report.decimals,
                  )}{" "}
                  USDC received
                </p>
                <p className="mt-1 text-xs">
                  {group.total.count} transfers · {group.total.uniquePayers}{" "}
                  unique senders
                </p>
                <dl className="mt-4 space-y-2 text-sm">
                  {(
                    [
                      ["verified", "Verified ENS402 settlements"],
                      ["facilitator", "Known facilitator observations"],
                      ["unclassified", "Other / unclassified receipts"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="flex justify-between gap-3">
                      <dt>{label}</dt>
                      <dd>
                        {formatUnits(
                          BigInt(group.totals[key].amountAtomic),
                          report.decimals,
                        )}{" "}
                        USDC
                      </dd>
                    </div>
                  ))}
                </dl>
                <details className="mt-4 text-xs text-muted-foreground">
                  <summary>Historical service associations</summary>
                  <p className="mt-2">
                    These intervals record observed control. Earlier receipts do
                    not become revenue of the current name owner.
                  </p>
                  <ul className="mt-2 space-y-3">
                    {group.associations.map((association, index) => (
                      <li
                        className="break-all"
                        key={`${association.name}:${association.since}:${index}`}
                      >
                        {association.name}
                        <br />
                        Control identity: {association.controlIdentity}
                        <br />
                        {new Date(
                          association.since * 1000,
                        ).toLocaleString()} to{" "}
                        {association.until === null
                          ? "current observation"
                          : new Date(association.until * 1000).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </details>
              </article>
            ))}
          </div>
          {report.groups.length === 0 && (
            <p className="mt-4 text-sm">
              No associated receipts in this observation window.
            </p>
          )}
          <details className="mt-5 text-xs text-muted-foreground">
            <summary>Coverage and attribution</summary>
            <ul className="mt-2 list-disc space-y-2 pl-5">
              {report.warnings.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
