"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Loader2, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResolvedService, EnsTransaction } from "@ens402/sdk/ens";
import type { Approval } from "@ens402/sdk";
import type { PaymentReceipt } from "@ens402/sdk/http";
import { ReceiptDetails } from "./receipt-details";
import { units, usdc, approvalStatus, statusLabel } from "./console-format";

type ApprovalRow = {
  mode: "hosted" | "self";
  id: string;
  service: ResolvedService;
  approval: Approval;
  daily_limit: string;
  state: string;
  payer: string | null;
};
type Execution = {
  prepared?: { typedData: Record<string, unknown> };
  id: string;
  approval_id: string;
  state: string;
  receipt: PaymentReceipt | null;
  created_at: string;
};
type State = {
  names: string[];
  approvals: ApprovalRow[];
  executions: Execution[];
  keys?: {
    id: string;
    approval_id: string;
    label: string;
    expires_at: string;
    revoked_at: string | null;
  }[];
};
type Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};
const field =
  "mt-2 w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
export function OperatorConsole({
  account,
}: {
  account?: {
    id: string;
    getToken: () => Promise<string | null>;
    getProvider: () => Promise<Provider>;
  };
} = {}) {
  const [view, setView] = useState<"buy" | "services" | "activity">("buy");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  const [mode, setMode] = useState<"hosted" | "self">("hosted");
  const [newKey, setNewKey] = useState("");
  const storageKey = `ens402-pending-attempt:${account?.id ?? "operator"}`;
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(!!account);
  const [setup, setSetup] = useState<{ name: string; configured: boolean }[]>(
    [],
  );
  const [state, setState] = useState<State>({
    names: [],
    approvals: [],
    executions: [],
  });
  const [name, setName] = useState("");
  const [service, setService] = useState<ResolvedService | null>(null);
  const [endpoints, setEndpoints] = useState("");
  const [limit, setLimit] = useState("0.01");
  const [daily, setDaily] = useState("1");
  const [hours, setHours] = useState("24");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [approvalKey, setApprovalKey] = useState("");
  const [attempt, setAttempt] = useState<{
    id: string;
    approvalId: string;
  } | null>(null);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [seller, setSeller] = useState("");
  const [record, setRecord] = useState("agent-endpoint[x402]");
  const [operation, setOperation] = useState("set");
  const [value, setValue] = useState("");
  const [operator, setOperator] = useState("");
  const [plan, setPlan] = useState<{
    transaction: EnsTransaction;
    broadTextPermission: boolean;
    note: string;
  } | null>(null);
  const [reconcileId, setReconcileId] = useState("");
  const [tx, setTx] = useState("");
  useEffect(() => {
    if (!account)
      fetch("/api/status")
        .then((r) => r.json())
        .then((data) => setSetup(data.configured))
        .catch(() => setError("Cannot load setup status."));
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) setAttempt(JSON.parse(stored));
    } catch {}
  }, []);
  async function api<T>(body: Record<string, unknown>): Promise<T> {
    const response = await fetch("/api/control", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${account ? await account.getToken() : token}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data as T;
  }
  useEffect(() => {
    if (account)
      void refresh().catch(() =>
        setError(
          "Could not load your workspace. Refresh the page or sign in again.",
        ),
      );
  }, []);
  async function refresh() {
    const data = await api<State>({ action: "state" });
    setState(data);
    setAttempt((previous) => {
      if (
        previous &&
        data.executions.some(
          (e) =>
            e.id === previous.id &&
            !["reserved", "submitting", "uncertain"].includes(e.state),
        )
      ) {
        sessionStorage.removeItem(storageKey);
        return null;
      }
      return previous;
    });
    setName((previous) => previous || data.names[0] || "");
  }
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      setBusy("");
    }
  }
  async function login(event: FormEvent) {
    event.preventDefault();
    await run("connect", async () => {
      await refresh();
      setConnected(true);
    });
  }
  async function inspect() {
    await run("inspect", async () => {
      const result = await api<ResolvedService>({ action: "inspect", name });
      setService(result);
      setEndpoints(result.endpoint);
      setRecord("agent-endpoint[x402]");
      setValue(result.endpoint);
      setApprovalKey(crypto.randomUUID());
      setPlan(null);
    });
  }
  async function approve(event: FormEvent) {
    event.preventDefault();
    await run("approve", async () => {
      if (!service) return;
      if (
        BigInt(units(limit)) <= 0n ||
        BigInt(units(daily)) < BigInt(units(limit))
      )
        throw new Error(
          "Set a positive payment limit and a daily limit at least as large.",
        );
      let payer: string | undefined;
      if (mode === "self") {
        const provider = await wallet();
        const accounts = (await provider.request({
          method: "eth_requestAccounts",
        })) as string[];
        payer = accounts[0];
        if (!payer) throw new Error("Connect a wallet first.");
      }
      await api({
        action: "approve",
        mode,
        payer,
        id: approvalKey,
        name: service.name,
        authority: service.authority,
        payTo: service.payment.payTo,
        endpoints: endpoints
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        maxAmount: units(limit),
        dailyLimit: units(daily),
        durationSeconds: Number(hours) * 3600,
      });
      await refresh();
      setNotice(
        mode === "hosted"
          ? "Managed wallet created. Fund its address below with Base Sepolia USDC."
          : "Your signing wallet is approved. ENS402 will check each purchase before asking you to sign.",
      );
      setApprovalKey(crypto.randomUUID());
    });
  }
  async function buy(approvalId: string) {
    await run("purchase", async () => {
      const row = state.approvals.find((a) => a.id === approvalId);
      if (!row) throw new Error("Approval not found.");
      const current =
        attempt?.approvalId === approvalId
          ? attempt
          : { id: crypto.randomUUID(), approvalId };
      setAttempt(current);
      sessionStorage.setItem(storageKey, JSON.stringify(current));
      let result: Execution;
      if (row.mode === "self") {
        result = await api<Execution>({
          action: "prepare-external",
          ...current,
        });
        if (result.state === "reserved" && result.prepared) {
          const provider = await wallet();
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x14a34" }],
          });
          const accounts = (await provider.request({
            method: "eth_requestAccounts",
          })) as string[];
          if (accounts[0]?.toLowerCase() !== row.payer?.toLowerCase())
            throw new Error("Select the wallet recorded on this approval.");
          const { createWalletClient, custom } = await import("viem");
          const { baseSepolia } = await import("viem/chains");
          const client = createWalletClient({
            chain: baseSepolia,
            transport: custom(provider),
          });
          const signature = await client.signTypedData({
            ...result.prepared.typedData,
            account: accounts[0],
          } as Parameters<typeof client.signTypedData>[0]);
          result = await api<Execution>({
            action: "submit-external",
            id: current.id,
            signature,
          });
        }
      } else result = await api<Execution>({ action: "execute", ...current });
      setBalances((previous) => {
        const next = { ...previous };
        delete next[approvalId];
        return next;
      });
      await refresh();
      setView("activity");
      if (!["reserved", "submitting", "uncertain"].includes(result.state)) {
        setAttempt(null);
        sessionStorage.removeItem(storageKey);
      }
      setNotice(
        result.receipt?.reason ||
          "Attempt recorded. Review its status before retrying.",
      );
    });
  }
  async function wallet(): Promise<Provider> {
    if (account) return account.getProvider();
    const provider = (window as unknown as { ethereum?: Provider }).ethereum;
    if (!provider) throw new Error("Connect an Ethereum wallet.");
    return provider;
  }
  async function connectSeller() {
    await run("seller", async () => {
      const provider = await wallet();
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }],
      });
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      setSeller(accounts[0] || "");
      setPlan(null);
    });
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    await run("prepare", async () => {
      setPlan(null);
      setPlan(
        await api({
          action: "ens",
          operation,
          name,
          from: seller,
          key: record,
          value,
          operator,
        }),
      );
    });
  }
  async function sendEns() {
    await run("send-ens", async () => {
      if (!plan) return;
      const provider = await wallet();
      if ((await provider.request({ method: "eth_chainId" })) !== "0xaa36a7")
        throw new Error("Switch your wallet to Sepolia.");
      const accounts = (await provider.request({
        method: "eth_accounts",
      })) as string[];
      if (accounts[0]?.toLowerCase() !== seller.toLowerCase())
        throw new Error("Wallet account changed. Connect and simulate again.");
      const hash = await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: seller,
            to: plan.transaction.to,
            data: plan.transaction.data,
            value: "0x0",
          },
        ],
      });
      setNotice(
        `ENS transaction submitted: ${String(hash)}. Wait for confirmation, then inspect the service again.`,
      );
      setPlan(null);
    });
  }
  const pending = state.executions.some((e) =>
    ["reserved", "submitting", "uncertain"].includes(e.state),
  );
  return (
    <div className="section-shell max-w-5xl py-10 sm:py-12">
      <p className="eyebrow">Workspace</p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-medium tracking-tight">Console</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            Buy from an ENS service, manage your service settings, or review a
            payment.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline">Testnets only</Badge>
          {connected && (
            <Button
              variant="outline"
              disabled={!!busy}
              onClick={() => run("refresh", refresh)}
            >
              <RefreshCw aria-hidden="true" />
              Refresh
            </Button>
          )}
        </div>
      </div>
      {!account && (
        <details
          className="mt-8 rounded-xl border bg-card p-5"
          open={setup.some((s) => !s.configured)}
        >
          <summary className="cursor-pointer text-sm font-medium">
            {setup.length
              ? `Server setup · ${setup.filter((s) => s.configured).length}/${setup.length} variables present`
              : "Checking server setup…"}
          </summary>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {setup.map((item) => (
              <p
                key={item.name}
                className="flex items-center gap-2 font-mono text-xs"
              >
                <span
                  className={
                    item.configured ? "text-primary" : "text-muted-foreground"
                  }
                >
                  {item.configured ? "✓" : "○"}
                </span>
                {item.name}
              </p>
            ))}
          </div>
          <p className="mt-4 text-xs leading-6 text-muted-foreground">
            Presence is not a live provider check. Database migration, a
            controlled ENS name and wallet funding are also required. Read
            SETUP.md in the repository.
          </p>
        </details>
      )}
      <div aria-live="polite" className="mt-5 space-y-3">
        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Updating your workspace…
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {notice && (
          <p className="break-all rounded-lg border border-primary/30 p-4 text-sm text-primary">
            {notice}
          </p>
        )}
      </div>
      {!connected ? (
        <form onSubmit={login} className="mt-8 max-w-lg rounded-xl border p-6">
          <h2 className="text-xl font-medium">Open your demo workspace</h2>
          <label className="mt-5 block text-sm">
            Demo access token
            <input
              type="password"
              autoComplete="off"
              className={field}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              minLength={32}
              required
            />
          </label>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            Use DEMO_ACCESS_TOKEN from your server setup. Never enter a Privy
            app secret here. This token is kept in memory only.
          </p>
          <Button className="mt-5" disabled={!!busy}>
            Connect workspace <ArrowRight aria-hidden="true" />
          </Button>
        </form>
      ) : (
        <>
          <nav
            aria-label="Workspace sections"
            className="mt-8 flex flex-wrap gap-2 border-b pb-4"
          >
            {(
              [
                ["buy", "Buy a service"],
                ["services", "Manage a service"],
                ["activity", "Payment activity"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                variant={view === id ? "default" : "ghost"}
                aria-current={view === id ? "page" : undefined}
                onClick={() => setView(id)}
              >
                {label}
              </Button>
            ))}
          </nav>
          {view === "services" && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-6">
              <div>
                <h2 className="text-xl font-medium">Publish your service</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Have an x402 endpoint? Register its name, recipient and wallet
                  permissions.
                </p>
              </div>
              <a
                href="/register"
                className="text-sm font-medium text-primary underline underline-offset-4"
              >
                Register a service →
              </a>
            </div>
          )}
          {view !== "activity" && (
            <section className="mt-10">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-medium">
                  {view === "services"
                    ? "Find your service"
                    : "Find a service to buy"}
                </h2>
              </div>
              <div className="mt-5 flex flex-wrap items-end gap-3">
                <label className="min-w-0 w-full sm:w-auto sm:min-w-64 flex-1 text-sm">
                  ENS service name
                  <input
                    placeholder="weather.yourname.eth"
                    list="service-names"
                    className={field}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setService(null);
                      setPlan(null);
                    }}
                  />
                  <datalist id="service-names">
                    {state.names.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </label>
                <Button disabled={!!busy || !name} onClick={inspect}>
                  Look up service
                </Button>
              </div>
              {service && (
                <Card className="mt-5">
                  <CardContent className="grid gap-5 p-6 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Current API URL
                      </p>
                      <p className="mt-2 break-all text-sm">
                        {service.endpoint}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        USDC recipient · Base Sepolia
                      </p>
                      <p className="mt-2 break-all font-mono text-xs">
                        {service.payment.payTo}
                      </p>
                    </div>
                    <details className="sm:col-span-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        ENS verification details
                      </summary>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Native resolver · Sepolia block {service.block}
                          </p>
                          <p className="mt-2 break-all font-mono text-xs">
                            {service.resolver}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Registered owner · {service.status}
                          </p>
                          <p className="mt-2 break-all font-mono text-xs">
                            {service.owner}
                          </p>
                        </div>
                      </div>
                    </details>
                  </CardContent>
                </Card>
              )}
            </section>
          )}
          {view === "buy" && service && (
            <section className="mt-10">
              <h2 className="text-2xl font-medium">Set your spending limits</h2>
              <form
                onSubmit={approve}
                className="mt-5 rounded-xl border bg-card p-6"
              >
                <fieldset className="mb-6">
                  <legend className="text-sm font-medium">
                    Who signs payments?
                  </legend>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {(["hosted", "self"] as const).map((value) => (
                      <label
                        key={value}
                        className={`cursor-pointer rounded-lg border p-4 ${mode === value ? "border-primary bg-primary/5" : ""}`}
                      >
                        <input
                          type="radio"
                          name="wallet-mode"
                          checked={mode === value}
                          onChange={() => {
                            setMode(value);
                            setApprovalKey(crypto.randomUUID());
                          }}
                          className="mr-2"
                        />
                        {value === "hosted"
                          ? "Managed agent wallet"
                          : "Use my own signer"}
                        <p className="mt-2 text-xs leading-6 text-muted-foreground">
                          {value === "hosted"
                            ? "Fund a dedicated Privy wallet. Your agent can purchase within your limits without a wallet popup. ENS402 controls this wallet."
                            : "Keep your wallet. We check the payment and request your signature. Direct payments outside ENS402 bypass these checks."}
                        </p>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <details>
                  <summary className="cursor-pointer text-sm">
                    Allowed API URLs
                  </summary>
                  <label className="mt-4 block text-sm">
                    Approved API URLs, one per line
                    <textarea
                      className={`${field} min-h-24 font-mono text-xs`}
                      value={endpoints}
                      onChange={(e) => {
                        setEndpoints(e.target.value);
                        setApprovalKey(crypto.randomUUID());
                      }}
                      required
                    />
                  </label>
                  {!account && service.endpoint.endsWith("/api/merchant/search") && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mt-2"
                      onClick={() => {
                        const next = new URL(
                          "/api/merchant/search-v2",
                          service.endpoint,
                        ).href;
                        setEndpoints((text) =>
                          text.includes(next) ? text : `${text}\n${next}`,
                        );
                        setApprovalKey(crypto.randomUUID());
                      }}
                    >
                      Also approve the demo v2 route
                    </Button>
                  )}
                </details>
                <div className="mt-5 grid gap-5 sm:grid-cols-3">
                  <label className="text-sm">
                    Maximum per payment (USDC)
                    <input
                      className={field}
                      value={limit}
                      inputMode="decimal"
                      onChange={(e) => {
                        setLimit(e.target.value);
                        setApprovalKey(crypto.randomUUID());
                      }}
                      required
                    />
                  </label>
                  <label className="text-sm">
                    Daily limit (USDC, resets at 00:00 UTC)
                    <input
                      className={field}
                      value={daily}
                      inputMode="decimal"
                      onChange={(e) => {
                        setDaily(e.target.value);
                        setApprovalKey(crypto.randomUUID());
                      }}
                      required
                    />
                  </label>
                  <label className="text-sm">
                    Approval duration, hours
                    <input
                      className={field}
                      type="number"
                      min="1"
                      max="720"
                      value={hours}
                      onChange={(e) => {
                        setHours(e.target.value);
                        setApprovalKey(crypto.randomUUID());
                      }}
                      required
                    />
                  </label>
                </div>
                <p className="mt-5 text-sm leading-7 text-muted-foreground">
                  These are spending limits, not the service price. Each HTTP
                  402 response supplies the actual price, which must fit these
                  limits and match the ENS recipient.{" "}
                  {mode === "hosted"
                    ? "Privy constrains each signature; the backend reserves the daily budget."
                    : "Your wallet signs. Backend limits apply only to purchases submitted through ENS402."}{" "}
                  A changed recipient or ownership observation requires another
                  approval.
                </p>
                <Button
                  className="mt-5"
                  disabled={!!busy || service.status !== "active"}
                >
                  {mode === "hosted"
                    ? "Approve and create agent wallet"
                    : "Approve my signing wallet"}
                </Button>
              </form>
            </section>
          )}
          <section hidden={view !== "buy"} className="mt-10">
            <h2 className="text-2xl font-medium">Your approved services</h2>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {state.approvals.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No approved services yet. Look up a name above to get started.
                </p>
              )}
              {state.approvals.map((row) => (
                <Card key={row.id}>
                  <CardHeader>
                    <CardTitle className="flex flex-wrap justify-between gap-3 text-base">
                      {row.approval.name}
                      <Badge variant="outline">
                        {statusLabel(approvalStatus(row, now))}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {usdc(row.approval.maxAmount)} USDC maximum per purchase ·{" "}
                      {usdc(row.daily_limit)} USDC daily
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {row.mode === "self"
                        ? "Your signer"
                        : "Managed by ENS402"}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Expires{" "}
                      {new Date(row.approval.expiresAt * 1000).toLocaleString()}
                    </p>
                    <p className="mt-5 text-xs text-muted-foreground">
                      Payment wallet · Base Sepolia USDC
                    </p>
                    <p className="mt-2 break-all font-mono text-xs">
                      {row.payer ||
                        "Provisioning incomplete. Retry the same approval."}
                    </p>
                    {balances[row.id] && (
                      <p className="mt-2 text-sm text-primary">
                        Last checked balance: {balances[row.id]} USDC
                      </p>
                    )}
                    <div className="mt-5 flex flex-wrap gap-2">
                      {row.state === "provisioning" && (
                        <Button
                          disabled={!!busy}
                          onClick={() =>
                            run("provision", async () => {
                              await api({
                                action: "resume-approval",
                                id: row.id,
                              });
                              await refresh();
                            })
                          }
                        >
                          Resume wallet setup
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        disabled={!!busy || !row.payer}
                        onClick={() =>
                          run("balance", async () => {
                            const balance = await api<{ units: string }>({
                              action: "balance",
                              id: row.id,
                            });
                            setBalances((b) => ({
                              ...b,
                              [row.id]: usdc(balance.units),
                            }));
                          })
                        }
                      >
                        Check balance
                      </Button>
                      <Button
                        disabled={
                          !!busy ||
                          approvalStatus(row, now) !== "active" ||
                          (pending && attempt?.approvalId !== row.id) ||
                          (!!attempt && attempt.approvalId !== row.id)
                        }
                        onClick={() => buy(row.id)}
                      >
                        {attempt?.approvalId === row.id
                          ? "Resume same attempt"
                          : "Buy once"}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={!!busy || row.state === "revoked"}
                        onClick={() =>
                          run("revoke", async () => {
                            await api({ action: "revoke", id: row.id });
                            await refresh();
                            setNotice(
                              "Future purchases revoked. Issued signatures are not cancelled.",
                            );
                          })
                        }
                      >
                        Revoke
                      </Button>
                    </div>
                    {account && approvalStatus(row, now) === "active" && (
                      <Button
                        variant="outline"
                        className="mt-3"
                        disabled={!!busy}
                        onClick={() =>
                          run("agent-key", async () => {
                            const key = await api<{ token: string }>({
                              action: "create-key",
                              approvalId: row.id,
                              label: `Agent for ${row.approval.name}`,
                            });
                            setNewKey(key.token);
                            await refresh();
                          })
                        }
                      >
                        Create agent API key
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
            {newKey && (
              <div className="mt-5 rounded-xl border border-primary p-5">
                <p className="font-medium">
                  Copy this agent key now. It will not be shown again.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  It can purchase only under its approval. It cannot create
                  wallets or raise limits.
                </p>
                <code className="mt-3 block break-all text-xs">{newKey}</code>
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => setNewKey("")}
                >
                  I saved it
                </Button>
              </div>
            )}
            {state.keys?.map((key) => (
              <div
                key={key.id}
                className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm"
              >
                <span>
                  {key.label} ·{" "}
                  {key.revoked_at
                    ? "Revoked"
                    : Date.parse(key.expires_at) <= now * 1000
                      ? "Expired"
                      : `Expires ${new Date(key.expires_at).toLocaleString()}`}
                </span>
                <Button
                  variant="ghost"
                  disabled={!!busy || !!key.revoked_at}
                  onClick={() =>
                    run("revoke-key", async () => {
                      await api({ action: "revoke-key", id: key.id });
                      await refresh();
                    })
                  }
                >
                  Revoke key
                </Button>
              </div>
            ))}
            {pending && (
              <p className="mt-4 text-sm text-muted-foreground">
                An attempt needs confirmation. Refresh its status or reconcile
                its transaction before making another purchase.
              </p>
            )}
          </section>
          <section hidden={view !== "activity"} className="mt-10">
            <h2 className="text-2xl font-medium">Payment activity</h2>
            <div className="mt-5 space-y-4">
              {state.executions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Every purchase attempt will appear here, including rejected
                  and uncertain attempts.
                </p>
              )}
              {state.executions.map((execution) => (
                <details
                  key={execution.id}
                  className="rounded-xl border p-5"
                  open={execution.id === state.executions[0]?.id}
                >
                  <summary className="cursor-pointer text-sm">
                    <Badge variant="outline" className="mr-3">
                      {statusLabel(execution.state)}
                    </Badge>
                    {execution.receipt?.reason ||
                      "Processing or awaiting reconciliation"}
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {state.approvals.find((a) => a.id === execution.approval_id)
                      ?.approval.name || "Service purchase"}{" "}
                    · {new Date(execution.created_at).toLocaleString()}
                  </p>
                  <ReceiptDetails
                    receipt={execution.receipt}
                    attemptId={execution.id}
                  />
                  {execution.state === "reserved" &&
                    state.approvals.find((a) => a.id === execution.approval_id)
                      ?.mode === "self" && (
                      <Button
                        className="mt-4 mr-3"
                        disabled={!!busy}
                        onClick={() => {
                          setAttempt({
                            id: execution.id,
                            approvalId: execution.approval_id,
                          });
                          sessionStorage.setItem(
                            storageKey,
                            JSON.stringify({
                              id: execution.id,
                              approvalId: execution.approval_id,
                            }),
                          );
                          setNotice(
                            "Attempt selected. Use Resume same attempt on its wallet card.",
                          );
                        }}
                      >
                        Select for signing
                      </Button>
                    )}
                  {execution.state === "reserved" && (
                    <Button
                      variant="outline"
                      className="mt-4"
                      disabled={!!busy}
                      onClick={() =>
                        run("cancel", async () => {
                          await api({ action: "cancel", id: execution.id });
                          await refresh();
                          if (attempt?.id === execution.id) {
                            setAttempt(null);
                            sessionStorage.removeItem(storageKey);
                          }
                        })
                      }
                    >
                      Cancel unsent attempt
                    </Button>
                  )}
                  {["submitting", "uncertain"].includes(execution.state) && (
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={() => setReconcileId(execution.id)}
                    >
                      Reconcile this attempt
                    </Button>
                  )}
                </details>
              ))}
            </div>
            {reconcileId && (
              <form
                className="mt-5 rounded-xl border p-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run("reconcile", async () => {
                    await api({
                      action: "reconcile",
                      id: reconcileId,
                      transaction: tx,
                    });
                    await refresh();
                    if (attempt?.id === reconcileId) {
                      setAttempt(null);
                      sessionStorage.removeItem(storageKey);
                    }
                    setReconcileId("");
                  });
                }}
              >
                <label className="text-sm">
                  Base Sepolia transaction hash
                  <input
                    className={field}
                    value={tx}
                    onChange={(e) => setTx(e.target.value)}
                    pattern="0x[0-9a-fA-F]{64}"
                    required
                  />
                </label>
                <Button className="mt-4" disabled={!!busy}>
                  Verify nonce and transfer
                </Button>
              </form>
            )}
          </section>
          <section hidden={view !== "services"} className="mt-10">
            <p className="eyebrow">Service settings</p>
            <h2 className="mt-4 text-2xl font-medium">
              Delegate the API URL. Protect payment settings.
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              Ops updates the API URL. Treasury updates the recipient. Admin
              manages who can make these changes. Look up your service and
              connect the wallet with the matching permission.
            </p>
            <a
              href="/permissions"
              className="mt-3 inline-block text-sm text-primary underline"
            >
              Wallet roles, resources and setup flow
            </a>
            <Button
              variant="outline"
              className="mt-5"
              disabled={!!busy}
              onClick={connectSeller}
            >
              <Wallet aria-hidden="true" />
              {seller ? "Reconnect Sepolia wallet" : "Connect Sepolia wallet"}
            </Button>
            {seller && (
              <p className="mt-3 break-all font-mono text-xs text-muted-foreground">
                {seller}
              </p>
            )}
            {seller && service && (
              <form onSubmit={prepare} className="mt-5 rounded-xl border p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    Operation
                    <select
                      className={field}
                      value={operation}
                      onChange={(e) => {
                        setOperation(e.target.value);
                        setPlan(null);
                      }}
                    >
                      <option value="set">Update record</option>
                      <option value="grant">Grant record permission</option>
                      <option value="revoke">Revoke record permission</option>
                    </select>
                  </label>
                  <label className="text-sm">
                    Record
                    <select
                      className={field}
                      value={record}
                      onChange={(e) => {
                        setRecord(e.target.value);
                        setPlan(null);
                        setValue(
                          e.target.value === "ens402.payment"
                            ? JSON.stringify(service?.payment ?? {}, null, 2)
                            : e.target.value === "ens402.status"
                              ? "active"
                              : (service?.endpoint ?? ""),
                        );
                      }}
                    >
                      {[
                        "agent-endpoint[x402]",
                        "ens402.payment",
                        "ens402.status",
                      ].map((key) => (
                        <option key={key} value={key}>
                          {key === "agent-endpoint[x402]"
                            ? "API URL"
                            : key === "ens402.payment"
                              ? "Payment settings"
                              : "Availability"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {operation === "set" ? (
                  record === "ens402.payment" ? (
                    <label className="mt-4 block text-sm">
                      USDC recipient · Base Sepolia
                      <input
                        className={field}
                        value={(() => {
                          try {
                            return JSON.parse(value).payTo ?? "";
                          } catch {
                            return "";
                          }
                        })()}
                        onChange={(e) => {
                          setValue(
                            JSON.stringify({
                              ...service?.payment,
                              payTo: e.target.value,
                            }),
                          );
                          setPlan(null);
                        }}
                        pattern="0x[0-9a-fA-F]{40}"
                        required
                      />
                      <span className="mt-2 block text-xs text-muted-foreground">
                        Changing the recipient requires buyers to approve again.
                      </span>
                    </label>
                  ) : record === "ens402.status" ? (
                    <label className="mt-4 block text-sm">
                      Service availability
                      <select
                        className={field}
                        value={value}
                        onChange={(e) => {
                          setValue(e.target.value);
                          setPlan(null);
                        }}
                      >
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    </label>
                  ) : (
                    <label className="mt-4 block text-sm">
                      API URL
                      <textarea
                        className={`${field} min-h-24 font-mono text-xs`}
                        value={value}
                        onChange={(e) => {
                          setValue(e.target.value);
                          setPlan(null);
                        }}
                        required
                      />
                    </label>
                  )
                ) : (
                  <label className="mt-4 block text-sm">
                    Operator wallet address
                    <input
                      className={field}
                      value={operator}
                      onChange={(e) => {
                        setOperator(e.target.value);
                        setPlan(null);
                      }}
                      pattern="0x[0-9a-fA-F]{40}"
                      required
                    />
                  </label>
                )}
                <Button className="mt-5" disabled={!!busy || !service}>
                  Prepare and simulate
                </Button>
              </form>
            )}
            {plan && (
              <div className="mt-5 rounded-xl border border-primary/30 p-5">
                <p className="text-sm font-medium">
                  {plan.transaction.description}
                </p>
                <p className="mt-3 text-xs leading-6 text-muted-foreground">
                  {plan.note}
                  {plan.broadTextPermission
                    ? " This signer has broad root text permission. Narrow revocation does not remove that permission."
                    : ""}
                </p>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm">
                    Transaction calldata
                  </summary>
                  <pre className="mt-3 overflow-auto text-xs">
                    {JSON.stringify(plan.transaction, null, 2)}
                  </pre>
                </details>
                <Button className="mt-5" disabled={!!busy} onClick={sendEns}>
                  Review and submit in wallet
                </Button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
