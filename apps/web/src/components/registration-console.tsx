"use client";
import { selectedWallet } from "./wallet-session";
import { useState } from "react";
import {
  bytesToHex,
  parseUnits,
  createPublicClient,
  createWalletClient,
  custom,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { packetToBytes } from "viem/ens";
import { serviceRegistrarAbi } from "@ens402/sdk/ens/registration";
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
  };
};
const field = "mt-2 w-full rounded-md border bg-background px-3 py-2.5 text-sm";
export function RegistrationConsole({
  registrar,
  parent,
  getProvider,
  walletAddress,
}: {
  registrar: string;
  parent: string;
  getProvider: () => Promise<Provider>;
  walletAddress?: string;
}) {
  const [label, setLabel] = useState(""),
    [endpoint, setEndpoint] = useState(""),
    [payTo, setPayTo] = useState(""),
    [operator, setOperator] = useState(""),
    [treasury, setTreasury] = useState(""),
    [description, setDescription] = useState(""),
    [picture, setPicture] = useState(""),
    [price, setPrice] = useState("0.01");
  const [pending, setPending] = useState<Pending | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const configured = /^0x[0-9a-fA-F]{40}$/.test(registrar) && !!parent;
  async function run(reveal: boolean) {
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
      const storageKey = `ens402-registration:${registrar}:${owner.toLowerCase()}`;
      if (!reveal) {
        if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(label))
          throw new Error("Use 3-32 lowercase letters, numbers or hyphens.");
        const url = new URL(endpoint);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.hash
        )
          throw new Error("Use a public HTTPS endpoint.");
        for (const a of [payTo, operator, treasury])
          if (!/^0x[0-9a-fA-F]{40}$/.test(a) || /^0x0{40}$/.test(a))
            throw new Error("Use nonzero Ethereum addresses.");
        if (
          operator.toLowerCase() === treasury.toLowerCase() ||
          operator.toLowerCase() === owner.toLowerCase()
        )
          throw new Error(
            "Ops must differ from the service Admin and Treasury.",
          );
        if (
          !description.trim() ||
          new TextEncoder().encode(description.trim()).length > 1024
        )
          throw new Error("Provide a description of at most 1024 bytes.");
        if (
          !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(price) ||
          parseUnits(price, 6) <= 0n
        )
          throw new Error(
            "Use a positive USDC price with at most six decimals.",
          );
        if (
          picture &&
          (new URL(picture).protocol !== "https:" ||
            new URL(picture).username ||
            new URL(picture).password ||
            new URL(picture).hash)
        )
          throw new Error("Use an HTTPS picture URL.");
        const service = {
          label,
          endpoint: url.href,
          payTo: payTo as Address,
          endpointOperator: operator as Address,
          treasury: treasury as Address,
          description: description.trim(),
          picture,
          price: parseUnits(price, 6).toString(),
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
          `Registered ${draft.service.label}.${parent}. Your wallet owns its native name and resolver administration. Transaction: ${hash}`,
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
        Register a subname with its own native ENS resolver. Delegate API URL
        edits to an operator and payment settings to Treasury. The wallet that
        registers is the service Admin and must differ from Ops. It keeps root
        text administration; the registration contract gives up its resolver
        permissions.
      </p>
      {!configured ? (
        <div className="mt-8 rounded-xl border p-6">
          <h2 className="text-xl">Namespace setup is pending</h2>
          <p className="mt-3 leading-7 text-muted-foreground">
            The platform first needs an ENSv2 Sepolia parent name and a deployed
            ServiceRegistrar with native registrar permission. No registration
            fee or transaction is requested while setup is pending.
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
              Subname
              <input
                className={field}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="kevinweather"
                required
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                .{parent}
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
              Service description
              <textarea
                className={field}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={1024}
                required
              />
            </label>
            <label className="text-sm">
              Picture URL (optional)
              <input
                className={field}
                type="url"
                value={picture}
                onChange={(e) => setPicture(e.target.value)}
                maxLength={2048}
              />
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
            {[
              ["USDC recipient", payTo, setPayTo],
              ["Endpoint operator", operator, setOperator],
              ["Treasury operator", treasury, setTreasury],
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
                Registration is free apart from Sepolia gas. The namespace has a
                fixed expiry; parent administrators retain native override
                powers. This is not an independent mainnet .eth registration.
              </p>
              <Button className="mt-5" disabled={busy}>
                1. Commit registration
              </Button>
              <Button
                type="button"
                variant="outline"
                className="ml-3 mt-5"
                disabled={busy}
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
