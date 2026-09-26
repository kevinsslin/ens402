"use client";
import { serializePaymentRecord } from "@ens402/sdk/ens";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Loader2, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResolvedService, EnsTransaction } from "@ens402/sdk/ens";
import type { Approval } from "@ens402/sdk";
import { preparePostInput } from "@ens402/sdk/call";
import type { ResourceRequest } from "@ens402/sdk/request";
import type { PaymentReceipt } from "@ens402/sdk/http";
import { selectedWallet } from "./wallet-session";
import { DiscoveryConsole } from "./discovery-console";
import { ReceiptDetails } from "./receipt-details";
import { usdc, approvalStatus, statusLabel } from "./console-format";

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
  prepared?: {
    typedData: Record<string, unknown>;
    receipt?: { request?: ResourceRequest };
  };
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
    walletAddress?: string;
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
  const [checkoutId, setCheckoutId] = useState("");
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
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const candidate = query.get("service");
    if (query.get("manage") === "1") setView("services");
    if (
      candidate &&
      /^[a-z0-9.-]+\.eth$/.test(candidate) &&
      candidate.length <= 255
    ) {
      setName(candidate);
      if (account) void inspect(candidate);
    }
  }, []);

  const [service, setService] = useState<ResolvedService | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [approvalKey, setApprovalKey] = useState("");
  const [attempt, setAttempt] = useState<{
    id: string;
    approvalId: string;
    request?: ResourceRequest;
  } | null>(null);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [operatorWallet, setOperatorWallet] = useState("");
  const seller = account ? (account.walletAddress ?? "") : operatorWallet;
  const [postInputs, setPostInputs] = useState<Record<string, string>>({});
  const [buyLabel, setBuyLabel] = useState("");
  const [buyRecipient, setBuyRecipient] = useState("");
  const [record, setRecord] = useState("agent-endpoint[x402]");
  const [operation, setOperation] = useState("set");
  const [value, setValue] = useState("");
  const [operator, setOperator] = useState("");
  const [plan, setPlan] = useState<{
    transaction: EnsTransaction;
    signer: string;
    broadTextPermission: boolean;
    note: string;
  } | null>(null);
  useEffect(() => {
    setPlan(null);
    setApprovalKey(crypto.randomUUID());
  }, [seller]);
  const [reconcileId, setReconcileId] = useState("");
  const [tx, setTx] = useState("");
  useEffect(() => {
    if (!account)
      fetch("/api/status")
        .then((r) => r.json())
        .then((data) => setSetup(data.configured))
        .catch(() => setError("Cannot load setup status."));
    try {
      setCheckoutId(sessionStorage.getItem(`${storageKey}:checkout`) || "");
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
  async function inspect(selectedName = name) {
    setName(selectedName);
    setService(null);
    await run("inspect", async () => {
      const result = await api<ResolvedService>({
        action: "inspect",
        name: selectedName,
      });
      setService(result);
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
      if (service.payment.version === 1)
        throw new Error("This demo requires a published fixed price.");
      const price = service.payment.pricing.amount;
      let payer: string | undefined;
      if (mode === "self") {
        const provider = await wallet();
        payer = await selectedWallet(provider, account?.walletAddress);
      }
      await api({
        action: "approve",
        mode,
        payer,
        id: approvalKey,
        name: service.name,
        authority: service.authority,
        payTo: service.payment.payTo,
        fixedPrice: price,
        endpoints: [service.endpoint],
        maxAmount: price,
        dailyLimit: price,
        durationSeconds: 600,
      });
      setCheckoutId(approvalKey);
      sessionStorage.setItem(`${storageKey}:checkout`, approvalKey);
      await refresh();
      setNotice(
        mode === "hosted"
          ? "Managed wallet created. Fund its address below with Base Sepolia USDC."
          : "Wallet ready. Review the price below, then confirm payment.",
      );
      setApprovalKey(crypto.randomUUID());
    });
  }
  async function exportCli(row: ApprovalRow) {
    await run("export-cli", async () => {
      const key = await api<{ token: string }>({ action: "create-key", approvalId: row.id, label: "CLI checkout" });
      const blob = new Blob([JSON.stringify({ version: 1, baseUrl: window.location.origin, apiKey: key.token, approvalId: row.id, mode: row.mode, payer: row.payer, approval: row.approval }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "ens402-checkout.json";
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("CLI checkout downloaded. Keep it private and out of Git. It shares this checkout's price, budget and expiry; revoking checkout also revokes its CLI access.");
    });
  }
  async function buy(approvalId: string) {
    await run("purchase", async () => {
      const row = state.approvals.find((a) => a.id === approvalId);
      if (!row) throw new Error("Approval not found.");
      const current: {
        id: string;
        approvalId: string;
        request?: ResourceRequest;
      } =
        attempt?.approvalId === approvalId
          ? attempt
          : { id: crypto.randomUUID(), approvalId };
      const isRegistration = row.service.endpoint.endsWith(
        "/api/merchant/register",
      );
      if (
        isRegistration &&
        !current.request &&
        (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(buyLabel) ||
          !/^0x[0-9a-fA-F]{40}$/.test(buyRecipient) ||
          /^0x0{40}$/.test(buyRecipient))
      )
        throw new Error(
          "Enter the subname label and recipient before purchasing.",
        );
      const resourceRequest =
        current.request ??
        (isRegistration
          ? {
              method: "POST" as const,
              body: JSON.stringify({
                orderId: current.id,
                label: buyLabel,
                recipient: buyRecipient,
              }),
            }
          : row.service.call?.method === "POST"
            ? preparePostInput(
                postInputs[row.id] ??
                  JSON.stringify(row.service.call.example ?? {}),
                current.id,
              )
            : undefined);
      current.request = resourceRequest;
      setAttempt(current);
      sessionStorage.setItem(storageKey, JSON.stringify(current));
      let result: Execution;
      if (row.mode === "self") {
        result = await api<Execution>({
          action: "prepare-external",
          ...current,
          request: resourceRequest,
        });
        if (result.state === "reserved" && result.prepared) {
          const provider = await wallet();
          const signerAddress = await selectedWallet(
            provider,
            row.payer ?? undefined,
            "0x14a34",
          );
          const { createWalletClient, custom } = await import("viem");
          const { baseSepolia } = await import("viem/chains");
          const client = createWalletClient({
            chain: baseSepolia,
            transport: custom(provider),
          });
          const signature = await client.signTypedData({
            ...result.prepared.typedData,
            account: signerAddress,
          } as Parameters<typeof client.signTypedData>[0]);
          result = await api<Execution>({
            action: "submit-external",
            id: current.id,
            signature,
          });
        }
      } else
        result = await api<Execution>({
          action: "execute",
          ...current,
          request: resourceRequest,
        });
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
      const accounts = (await provider.request({
        method: "eth_requestAccounts",
      })) as string[];
      setOperatorWallet(accounts[0] || "");
      setPlan(null);
    });
  }
  async function prepare(event: FormEvent) {
    event.preventDefault();
    await run("prepare", async () => {
      setPlan(null);
      await selectedWallet(await wallet(), seller);
      const prepared = await api<{
        transaction: EnsTransaction;
        broadTextPermission: boolean;
        note: string;
      }>({
        action: "ens",
        operation,
        name,
        from: seller,
        key: record,
        value,
        operator,
      });
      setPlan({ ...prepared, signer: seller });
    });
  }
  async function sendEns() {
    await run("send-ens", async () => {
      if (!plan) return;
      const provider = await wallet();
      await selectedWallet(provider, plan.signer, "0xaa36a7");
      if (seller.toLowerCase() !== plan.signer.toLowerCase())
        throw new Error("Wallet changed. Prepare this change again.");
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
  useEffect(() => {
    if (service && view === "buy")
      document
        .getElementById("service-review")
        ?.scrollIntoView({ block: "start" });
  }, [service, view]);
  const pending = state.executions.some((e) =>
    ["reserved", "submitting", "uncertain"].includes(e.state),
  );
  return (
    <div className="section-shell max-w-5xl py-10 sm:py-12">
      <p className="eyebrow">Workspace</p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-medium tracking-tight">
            {view === "activity"
              ? "Payment activity"
              : view === "services"
                ? "Service settings"
                : "Search services"}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
            Find a service, review payment terms, and buy when you are ready.
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
        {connected &&
          state.approvals.some((a) =>
            a.service.endpoint.endsWith("/api/merchant/register"),
          ) && (
            <details className="mt-6 rounded-xl border p-5">
              <summary className="cursor-pointer text-sm font-medium">
                Buy an ENS subname for a recipient
              </summary>
              <p className="mt-3 text-sm text-muted-foreground">
                For a service pointing to /api/merchant/register. Enter the
                label and recipient, then purchase with its approval below. This
                buys a Sepolia subname, with no resolver. Payment and
                registration have separate receipts.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  Subname label
                  <input
                    className={field}
                    value={buyLabel}
                    onChange={(e) => setBuyLabel(e.target.value)}
                    placeholder="alice"
                  />
                </label>
                <label className="text-sm">
                  Recipient address
                  <input
                    className={field}
                    value={buyRecipient}
                    onChange={(e) => setBuyRecipient(e.target.value)}
                    placeholder="0x..."
                  />
                </label>
              </div>
            </details>
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
                ["buy", "Search services"],
                ["activity", "Activity"],
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
          {view === "buy" && (
            <DiscoveryConsole
              embedded
              selecting={!!busy}
              onSelect={(selectedName) => {
                void inspect(selectedName);
              }}
            />
          )}
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
          {(view === "buy" || view === "services") && (
            <section id="service-review" className="mt-6 scroll-mt-24">
              <details
                open={view === "services"}
                className="rounded-xl border bg-card p-4"
              >
                <summary className="cursor-pointer text-sm font-medium">
                  {view === "services"
                    ? "Find your service by ENS name"
                    : "Already have an ENS service name?"}
                </summary>
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
                  <Button disabled={!!busy || !name} onClick={() => inspect()}>
                    Look up service
                  </Button>
                </div>
              </details>
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
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Description
                      </p>
                      <p className="mt-2 text-sm">
                        {service.description || "No description published"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Published fixed price
                      </p>
                      <p className="mt-2 text-sm">
                        {service.payment.version !== 1
                          ? `${usdc(service.payment.pricing.amount)} USDC / request`
                          : "Fixed price required for this demo"}
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
              <h2 className="text-2xl font-medium">Confirm payment</h2>
              <form
                onSubmit={approve}
                className="mt-5 rounded-xl border bg-card p-6"
              >
                <fieldset className="mb-6">
                  <legend className="text-sm font-medium">
                    Payment wallet
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
                          ? "ENS402 managed wallet"
                          : "Use my connected wallet"}
                        <p className="mt-2 text-xs leading-6 text-muted-foreground">
                          {value === "hosted"
                            ? "Fund a dedicated Privy wallet managed by ENS402."
                            : "Pay from your connected wallet. Confirm the signature when the payment checks pass."}
                        </p>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <p className="text-2xl font-medium">
                  {service.payment.version !== 1
                    ? `${usdc(service.payment.pricing.amount)} USDC`
                    : "Fixed price unavailable"}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    per request
                  </span>
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  ENS402 checks the current endpoint, recipient, price and
                  recipient risk before signing. Nothing is paid when you
                  continue.
                </p>
                <Button
                  className="mt-5"
                  disabled={!!busy || service.status !== "active"}
                >
                  {mode === "hosted"
                    ? "Prepare payment wallet"
                    : "Continue to payment"}
                </Button>
              </form>
            </section>
          )}
          <section
            id="payment-checkout"
            hidden={
              view !== "buy" ||
              !state.approvals.some(
                (row) =>
                  row.id === attempt?.approvalId ||
                  (row.id === checkoutId &&
                    (!service || row.service.name === service.name)),
              )
            }
            className="mt-10"
          >
            <h2 className="text-2xl font-medium">Complete your purchase</h2>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {state.approvals
                .filter(
                  (row) =>
                    row.id === attempt?.approvalId ||
                    (row.id === checkoutId &&
                      (!service || row.service.name === service.name)),
                )
                .map((row) => (
                  <Card key={row.id}>
                    <CardHeader>
                      <CardTitle className="flex flex-wrap justify-between gap-3 text-base">
                        {row.approval.name}
                        <Badge variant="outline">
                          {row.state === "provisioning"
                            ? "Wallet setup pending"
                            : approvalStatus(row, now) === "active"
                              ? "Ready to pay"
                              : "Checkout closed"}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {usdc(
                          row.approval.fixedPrice ?? row.approval.maxAmount,
                        )}{" "}
                        USDC / request
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {row.mode === "self"
                          ? "Your signer"
                          : "Managed by ENS402"}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Complete checkout before{" "}
                        {new Date(
                          row.approval.expiresAt * 1000,
                        ).toLocaleString()}
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
                      {row.service.call?.method === "POST" &&
                        !row.service.endpoint.endsWith(
                          "/api/merchant/register",
                        ) && (
                          <details className="mt-5 rounded-lg border p-4" open>
                            <summary className="cursor-pointer text-sm font-medium">
                              POST request input
                            </summary>
                            <p className="mt-2 text-xs leading-6 text-muted-foreground">
                              Enter a JSON object. ENS402 adds an orderId and
                              binds the exact request to this purchase. The
                              merchant must support ENS402 request binding.
                            </p>
                            <label className="mt-3 block text-sm">
                              JSON input
                              <textarea
                                className={`${field} min-h-28 font-mono text-xs`}
                                aria-label={`JSON input for ${row.service.name}`}
                                value={
                                  (attempt?.approvalId === row.id
                                    ? attempt.request?.body
                                    : undefined) ??
                                  postInputs[row.id] ??
                                  JSON.stringify(
                                    row.service.call.example ?? {},
                                    null,
                                    2,
                                  )
                                }
                                maxLength={8192}
                                disabled={!!attempt}
                                onChange={(event) =>
                                  setPostInputs((previous) => ({
                                    ...previous,
                                    [row.id]: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            {row.service.call.inputSchema && (
                              <details className="mt-3 text-xs">
                                <summary className="cursor-pointer">
                                  Provider input schema
                                </summary>
                                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">
                                  {JSON.stringify(
                                    row.service.call.inputSchema,
                                    null,
                                    2,
                                  )}
                                </pre>
                              </details>
                            )}
                          </details>
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
                        {account && <Button variant="outline" disabled={!!busy || approvalStatus(row, now) !== "active" || !row.payer} onClick={() => exportCli(row)}>Export CLI checkout</Button>}
                        <Button
                          variant="ghost"
                          disabled={!!busy || row.state === "revoked"}
                          onClick={() =>
                            run("revoke", async () => {
                              await api({ action: "revoke", id: row.id });
                              await refresh();
                              setNotice(
                                "Checkout cancelled. Already-issued payment signatures are not cancelled.",
                              );
                            })
                          }
                        >
                          Cancel checkout
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </div>
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
                          const selected = {
                            id: execution.id,
                            approvalId: execution.approval_id,
                            request:
                              execution.prepared?.receipt?.request ??
                              (attempt?.id === execution.id
                                ? attempt.request
                                : undefined),
                          };
                          setAttempt(selected);
                          sessionStorage.setItem(
                            storageKey,
                            JSON.stringify(selected),
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
              select the wallet with the matching permission at the top of this
              page.
            </p>
            <a
              href="/permissions"
              className="mt-3 inline-block text-sm text-primary underline"
            >
              Wallet roles, resources and setup flow
            </a>
            {!account && (
              <Button
                variant="outline"
                className="mt-5"
                disabled={!!busy}
                onClick={connectSeller}
              >
                <Wallet aria-hidden="true" />
                {seller ? "Change wallet" : "Connect wallet"}
              </Button>
            )}
            <p className="mt-4 text-sm text-muted-foreground">
              {seller
                ? "Uses your selected wallet. Submitting this change may ask you to switch to Ethereum Sepolia."
                : "Connect a wallet at the top of the page to edit this service. ENS402 managed wallets are for purchases."}
            </p>
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
                            ? service
                              ? serializePaymentRecord(service.payment)
                              : "{}"
                            : e.target.value === "ens402.status"
                              ? "active"
                              : e.target.value === "description"
                                ? (service?.description ?? "")
                                : e.target.value === "ens402.call"
                                  ? '{"method":"GET"}'
                                  : e.target.value === "avatar"
                                    ? (service?.picture ?? "")
                                    : (service?.endpoint ?? ""),
                        );
                      }}
                    >
                      {[
                        "agent-endpoint[x402]",
                        "ens402.payment",
                        "ens402.status",
                        "description",
                        "avatar",
                        "ens402.call",
                      ].map((key) => (
                        <option key={key} value={key}>
                          {key === "agent-endpoint[x402]"
                            ? "API URL"
                            : key === "ens402.payment"
                              ? "Payment settings"
                              : key === "description"
                                ? "Description"
                                : key === "ens402.call"
                                  ? "Call schema"
                                  : key === "avatar"
                                    ? "Picture URL"
                                    : "Availability"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {operation === "set" ? (
                  record === "ens402.payment" ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="text-sm">
                        USDC recipient
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
                            try {
                              setValue(
                                JSON.stringify({
                                  ...JSON.parse(value),
                                  payTo: e.target.value,
                                }),
                              );
                              setPlan(null);
                            } catch {}
                          }}
                          pattern="0x[0-9a-fA-F]{40}"
                          required
                        />
                      </label>
                      <label className="text-sm">
                        Fixed price (atomic USDC units)
                        <input
                          className={field}
                          inputMode="numeric"
                          value={(() => {
                            try {
                              return JSON.parse(value).pricing?.amount ?? "";
                            } catch {
                              return "";
                            }
                          })()}
                          onChange={(e) => {
                            try {
                              setValue(
                                JSON.stringify({
                                  ...JSON.parse(value),
                                  version: 2,
                                  pricing: {
                                    model: "fixed",
                                    amount: e.target.value,
                                    unit: "request",
                                  },
                                }),
                              );
                              setPlan(null);
                            } catch {}
                          }}
                          pattern="[1-9][0-9]*"
                          required
                        />
                        <span className="mt-2 block text-xs text-muted-foreground">
                          10,000 units = 0.01 USDC. Price or recipient changes
                          require renewed fixed-price approval.
                        </span>
                      </label>
                    </div>
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
                      {record === "description"
                        ? "Service description"
                        : record === "ens402.call"
                          ? "Call metadata JSON (explicit GET or POST)"
                          : record === "avatar"
                            ? "Picture URL (HTTPS, optional)"
                            : "API URL"}
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
