"use client";
import { selectedWallet } from "./wallet-session";
import { useState } from "react";
import {
  bytesToHex,
  createPublicClient,
  createWalletClient,
  custom,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { packetToBytes } from "viem/ens";
import { serviceRegistrarAbi } from "@ens402/sdk/ens/registration";
import { units } from "./console-format";
import { validAmount } from "@ens402/sdk";
import {
  validateDescription,
  validateEndpoint,
  validatePicture,
} from "@ens402/sdk/ens";
import { Button } from "./ui/button";

type Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};
type Pending = {
  owner: Address;
  secret: Hex;
  commitment: Hex;
  service: {
    label: string;
    endpoint: string;
    payTo: Address;
    endpointOperator: Address;
    treasury: Address;
    description: string;
    picture: string;
    price: string;
    callConfig: string;
  };
};
const field = "mt-2 w-full rounded-md border bg-background px-3 py-2.5 text-sm";
export function RegistrationConsole({
  registrar,
  parent,
  getProvider,
  walletAddress,
  example = false,
  restricted = false,
  shared,
}: {
  registrar: string;
  parent: string;
  getProvider: () => Promise<Provider>;
  walletAddress?: string;
  example?: boolean;
  restricted?: boolean;
  shared?: { resolver: string; ops: string; treasury: string };
}) {
  const [label, setLabel] = useState(example ? "weather" : ""),
    [endpoint, setEndpoint] = useState(
      example ? "https://api.example.com/weather" : "",
    ),
    [payTo, setPayTo] = useState(
      example ? "0x4444444444444444444444444444444444444444" : "",
    ),
    [operator, setOperator] = useState(
      example ? "0x2222222222222222222222222222222222222222" : shared?.ops || "",
    ),
    [treasury, setTreasury] = useState(
      example ? "0x3333333333333333333333333333333333333333" : shared?.treasury || "",
    ),
    [description, setDescription] = useState(
      example
        ? "Returns current weather for one city as JSON. One request returns one forecast."
        : "",
    ),
    [picture, setPicture] = useState(""),
    [price, setPrice] = useState("0.01");
  const [method, setMethod] = useState<"GET" | "POST">("GET");
  const [inputSchema, setInputSchema] = useState("");
  const [exampleInput, setExampleInput] = useState("");
  const [pending, setPending] = useState<Pending | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const configured = /^0x[0-9a-fA-F]{40}$/.test(registrar) && !!parent;
  const descriptionBytes = new TextEncoder().encode(description).length;
  let atomicPrice = "Invalid amount";
  try {
    atomicPrice = units(price);
  } catch {
    /* Keep the form editable. */
  }
  async function run(reveal: boolean) {
    if (example) return;
    setBusy(true);
    setMessage("");
    try {
      const provider = await getProvider();
      const owner = (await selectedWallet(
        provider,
        walletAddress,
        "0xaa36a7",
      )) as Address;
      const client = createPublicClient({
          chain: sepolia,
          transport: custom(provider),
        }),
        wallet = createWalletClient({
          chain: sepolia,
          transport: custom(provider),
          account: owner,
        }),
        address = registrar as Address;
      if (
        !(await client.readContract({
          address,
          abi: serviceRegistrarAbi,
          functionName: "currentResolver",
        }))
      )
        throw new Error(
          "This registrar does not use the current supported resolver.",
        );
      if (
        (await client.readContract({
          address,
          abi: serviceRegistrarAbi,
          functionName: "parentDNS",
        })) !== bytesToHex(packetToBytes(parent))
      )
        throw new Error("Registrar parent does not match this site.");
      if (shared && (await client.readContract({ address, abi: serviceRegistrarAbi, functionName: "sharedResolver" })).toLowerCase() !== shared.resolver.toLowerCase())
        throw new Error("Registrar shared resolver does not match provider configuration.");
      if (restricted) {
        const registry = await client.readContract({ address, abi: serviceRegistrarAbi, functionName: "registry" });
        const { parseAbi } = await import("viem");
        const authorized = await client.readContract({ address: registry, abi: parseAbi(["function hasRootRoles(uint256 roles,address account) view returns(bool)"]), functionName: "hasRootRoles", args: [1n, owner] });
        if (!authorized) throw new Error("This wallet needs the provider’s native service registration permission.");
      }
      const storageKey = `ens402-registration-call-v1:${registrar}:${owner.toLowerCase()}`;
      if (!reveal) {
        if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(label))
          throw new Error("Use 3-32 lowercase letters, numbers or hyphens.");
        const normalizedEndpoint = validateEndpoint(endpoint);
        for (const a of [payTo, operator, treasury])
          if (!/^0x[0-9a-fA-F]{40}$/.test(a) || /^0x0{40}$/.test(a))
            throw new Error("Use nonzero Ethereum addresses.");
        if (
          operator.toLowerCase() === treasury.toLowerCase() ||
          (!shared && operator.toLowerCase() === owner.toLowerCase())
        )
          throw new Error(
            "Ops must differ from the service Admin and Treasury.",
          );
        const normalizedDescription = validateDescription(description);
        if (!normalizedDescription)
          throw new Error("A service description is required.");
        const normalizedPicture = validatePicture(picture);
        const priceUnits = units(price);
        if (!validAmount(priceUnits) || BigInt(priceUnits) <= 0n)
          throw new Error("Use a positive USDC amount within uint256 bounds.");
        const call: { method: "GET" | "POST"; inputSchema?: Record<string, unknown>; example?: Record<string, unknown> } = { method };
        for (const [key, raw] of [["inputSchema", inputSchema], ["example", exampleInput]] as const) {
          if (!raw.trim()) continue;
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Call schema and example must be JSON objects.");
          call[key] = parsed;
        }
        const callConfig = JSON.stringify(call);
        if (new TextEncoder().encode(callConfig).length > 16384) throw new Error("Call metadata must fit within 16,384 bytes.");
        const service = {
          label,
          endpoint: normalizedEndpoint,
          payTo: payTo as Address,
          endpointOperator: operator as Address,
          treasury: treasury as Address,
          description: normalizedDescription,
          picture: normalizedPicture,
          price: priceUnits,
          callConfig,
        };
        const secret = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
        const commitment = await client.readContract({
          address,
          abi: serviceRegistrarAbi,
          functionName: "makeCommitment",
          args: [{ ...service, price: BigInt(service.price) }, owner, secret],
        });
        const draft = { owner, secret, commitment, service };
        sessionStorage.setItem(storageKey, JSON.stringify(draft));
        setPending(draft);
        const hash = await wallet.writeContract({
          address,
          abi: serviceRegistrarAbi,
          functionName: "commit",
          args: [commitment],
        });
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success")
          throw new Error("Commitment reverted.");
        setMessage(
          "Commitment confirmed. Wait 60 seconds, then complete registration.",
        );
      } else {
        const draft =
          (pending?.owner.toLowerCase() === owner.toLowerCase()
            ? pending
            : null) ??
          (JSON.parse(
            sessionStorage.getItem(storageKey) || "null",
          ) as Pending | null);
        if (!draft || draft.owner.toLowerCase() !== owner.toLowerCase())
          throw new Error("No pending registration for this wallet.");
        setPending(draft);
        const committedAt = await client.readContract({
          address,
          abi: serviceRegistrarAbi,
          functionName: "commitments",
          args: [draft.commitment],
        });
        const block = await client.getBlock();
        if (committedAt === 0n)
          throw new Error("Commitment has not been confirmed.");
        if (block.timestamp < committedAt + 60n)
          throw new Error("Wait at least 60 seconds after commitment.");
        const simulation = await client.simulateContract({
          account: owner,
          address,
          abi: serviceRegistrarAbi,
          functionName: "register",
          args: [
            { ...draft.service, price: BigInt(draft.service.price) },
            draft.secret,
          ],
        });
        const hash = await wallet.writeContract(simulation.request);
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success")
          throw new Error("Registration reverted.");
        sessionStorage.removeItem(storageKey);
        setPending(null);
        setMessage(
          `Registered ${draft.service.label}.${parent}. ${shared ? "Your wallet owns the name; Provider Admin retains shared resolver governance." : "Your wallet owns the name and resolver administration."} Listing awaits finalized index synchronization. Transaction: ${hash}`,
        );
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="section-shell py-14">
      <p className="eyebrow">Publish your service / Sepolia</p>
      <h1 className="mt-4 text-4xl font-medium">Give your API a name.</h1>
      <p className="mt-5 max-w-2xl leading-7 text-muted-foreground">
        {shared ? "Add your API and price. Existing provider delegates manage its records." : "Add your API, price and delegates. Your connected wallet becomes Admin."}
      </p>
      <div className="mt-5 rounded-xl border bg-card p-4 text-sm leading-6">
        {example
          ? "Example only · Placeholder addresses · Transactions disabled."
          : "ENS records: Sepolia. Payments: Base Sepolia USDC, 6 decimals."}
        <p className="mt-2">
          {shared ? "Service name owner: " : "Service Admin: "}
          {example
            ? "connected wallet (0x1111…1111 in this example)"
            : walletAddress || "your connected wallet"}
          . Picture URL, input schema and example input are optional.
        </p>
      </div>
      {shared && <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
        Shared provider resolver. Ops and Treasury Safe below must already hold their key grants.
        These grants apply to every service in this resolver; this form does not grant new permissions.
        Provider Admin keeps resolver governance. The payment recipient is specific to this service.
      </p>}
      {!configured && !example ? (
        <div className="mt-8 rounded-xl border p-6">
          <h2 className="text-xl">Namespace setup is pending</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            Registration opens after the platform completes setup.
            No payment or transaction is requested yet.
          </p>
          <a
            className="mt-4 inline-block text-primary underline"
            href="https://app.ens.dev"
            target="_blank"
            rel="noreferrer"
          >
            Open the ENS testnet app
          </a>
          <a href="/docs#names" className="ml-5 text-primary underline">
            Deployment steps
          </a>
        </div>
      ) : (
        <>
          <form
            className="mt-8 grid gap-5 rounded-xl border p-6 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(false);
            }}
          >
            <label className="text-sm">
              Subname (required)
              <input
                className={field}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="weather"
                minLength={3}
                maxLength={32}
                pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]"
                required
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                .{parent} · 3-32 lowercase letters, numbers or internal hyphens
              </span>
            </label>
            <label className="text-sm">
              Public HTTPS API endpoint
              <input
                className={field}
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                type="url"
                required
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Service description (required)
              <textarea
                className={field}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1024}
                required
              />
              <span
                className={`mt-1 block text-xs ${descriptionBytes > 1024 ? "text-destructive" : "text-muted-foreground"}`}
              >
                {descriptionBytes} / 1024 UTF-8 bytes. Chinese characters
                usually use 3 bytes each.
              </span>
            </label>
            <label className="text-sm">
              HTTP method (required)
              <select className={field} value={method} onChange={e => setMethod(e.target.value as "GET" | "POST")}><option value="GET">GET</option><option value="POST">POST</option></select>
            </label>
            <label className="text-sm sm:col-span-2">Input schema (optional JSON object)<textarea className={field} value={inputSchema} onChange={e => setInputSchema(e.target.value)} placeholder='{"type":"object","properties":{}}' /></label>
            <label className="text-sm sm:col-span-2">Example input (optional JSON object)<textarea className={field} value={exampleInput} onChange={e => setExampleInput(e.target.value)} placeholder='{}' /></label>
            <label className="text-sm">
              Picture URL (optional)
              <input
                className={field}
                type="url"
                value={picture}
                onChange={(e) => setPicture(e.target.value)}
                maxLength={2048}
                placeholder="https://example.com/icon.png"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Leave blank or use HTTPS, up to 2048 encoded UTF-8 bytes.
              </span>
            </label>
            <label className="text-sm">
              Fixed price per request (USDC)
              <input
                className={field}
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </label>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm sm:col-span-2">
              <p className="font-medium">
                {price || "0"} USDC × 10⁶ = {atomicPrice} atomic units
              </p>
              <details className="mt-2 text-muted-foreground">
                <summary className="cursor-pointer">How price matching works</summary>
                <p className="mt-2">Both ENS and HTTP 402 use this integer amount, on the same chain and token contract.</p>
              </details>
            </div>
            {[
              ["USDC recipient", payTo, setPayTo],
              [
                "Ops wallet (endpoint, description, picture, call schema)",
                operator,
                setOperator,
              ],
              [
                shared ? "Treasury Admin · Safe (existing payment writer)" : "Treasury wallet (price and payment settings)",
                treasury,
                setTreasury,
              ],
            ].map(([title, value, setter]) => (
              <label key={title as string} className="text-sm">
                {title as string}
                <input
                  className={field}
                  value={value as string}
                  onChange={(e) =>
                    (setter as (v: string) => void)(e.target.value)
                  }
                  pattern="0x[0-9a-fA-F]{40}"
                  required
                />
              </label>
            ))}
            <div className="sm:col-span-2">
              <p className="text-sm leading-7 text-muted-foreground">
                Publishing a service through this form costs Sepolia gas. Its
                API price is what future buyers pay per request. The namespace
                has a fixed expiry; parent administrators retain native override
                powers. This is not an independent mainnet .eth registration.
              </p>
              <Button className="mt-5" disabled={busy || example}>
                1. Commit registration
              </Button>
              <Button
                type="button"
                variant="outline"
                className="ml-3 mt-5"
                disabled={busy || example}
                onClick={() => run(true)}
              >
                2. Complete / resume registration
              </Button>
            </div>
          </form>
          {pending && (
            <p className="mt-4 text-sm">
              Pending: {pending.service.label}.{parent}. The reveal uses these
              committed settings.
            </p>
          )}
        </>
      )}
      {message && (
        <p
          role="status"
          className="mt-5 break-words rounded-lg border p-4 text-sm"
        >
          {message}
        </p>
      )}
    </section>
  );
}
