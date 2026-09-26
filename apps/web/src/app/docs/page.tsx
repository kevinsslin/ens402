import Link from "next/link";
const code =
  "mt-5 overflow-x-auto rounded-xl border bg-card p-5 text-xs leading-6";
export default function DocsPage() {
  return (
    <article className="section-shell max-w-5xl py-14">
      <p className="eyebrow">Integration guide / testnets</p>
      <Link
        href="/permissions"
        className="mt-5 block text-sm text-primary underline"
      >
        Merchant wallets, native roles and setup flow →
      </Link>
      <h1 className="mt-4 text-4xl font-medium">
        One verification stack.
        <br />
        Two ways to sign.
      </h1>
      <p className="mt-6 max-w-3xl leading-8 text-muted-foreground">
        ENS publishes service configuration. ENS402 compares the real HTTP 402,
        screens the recipient, and checks your approval before payment. Choose
        who controls the signing wallet.
      </p>
      <div className="mt-9 grid gap-5 md:grid-cols-2">
        <section className="rounded-xl border p-6">
          <h2 className="text-xl font-medium">Managed agent wallet</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Sign in with Privy, inspect a service, and approve its recipient,
            exact endpoints, amount and expiry. ENS402 creates a dedicated Privy
            wallet. Fund that address with Base Sepolia USDC, then create an
            agent API key for that approval.
          </p>
          <p className="mt-3 text-sm leading-7">
            Privy enforces per-signature policy. Our database reserves the daily
            budget. ENS402 controls the wallet and can change policy. This is a
            trusted platform service.
          </p>
        </section>
        <section className="rounded-xl border p-6">
          <h2 className="text-xl font-medium">Your own signer</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            Connect your wallet and choose “Use my own signer.” ENS402 prepares
            the exact payment after checks. You sign it; ENS402 verifies the
            signature, rechecks ENS and risk, and submits once.
          </p>
          <p className="mt-3 text-sm leading-7">
            No platform wallet is created. Your wallet needs test USDC. Payments
            outside ENS402 bypass its controls; our limits do not restrict your
            wallet globally. The current signing flow supports EOA EIP-3009
            signatures.
          </p>
        </section>
      </div>
      <section className="mt-12">
        <h2 className="text-2xl font-medium">
          Human approval → agent key → purchase
        </h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-4">
          {[
            "You choose a service and approve a scope.",
            "Your agent gets a key for that approval only.",
            "ENS402 resolves, verifies and screens each purchase.",
            "Privy or your signer signs. The merchant settles and returns data.",
          ].map((text, i) => (
            <li key={text} className="rounded-lg border p-4 text-sm leading-7">
              <span className="block text-primary">0{i + 1}</span>
              {text}
            </li>
          ))}
        </ol>
        <p className="mt-5 text-sm leading-7 text-muted-foreground">
          A key cannot create wallets, raise limits or approve a different
          service. A new service or recipient needs human approval. Endpoint
          updates continue only if the new exact URL was already approved. The
          resource API supports GET and bounded JSON POST requests at the
          ENS-published URL. POST orders require a UUID v4 orderId and a
          merchant supporting ENS402 request binding: the signed USDC nonce
          commits to the endpoint and exact body. Authentication headers are
          never forwarded.
        </p>
      </section>
      <section className="mt-12">
        <h2 className="text-2xl font-medium">
          Call the hosted API from an agent
        </h2>
        <p className="mt-4 text-sm leading-7">
          The SDK is currently a workspace package in this repository, not a
          published npm release. Import its platform entry point from a linked
          checkout. Keep the API key in the agent runtime, outside prompts and
          browser bundles.
        </p>
        <pre
          className={code}
        >{`import { ENS402Client } from '@ens402/sdk/platform';

const client = new ENS402Client({
  baseUrl: 'https://ens402.vercel.app',
  apiKey: process.env.ENS402_AGENT_KEY!,
});
// Persist this ID before making the request.
const id = crypto.randomUUID();
const result = await client.purchase({ id, approvalId });
// If the connection drops, query this ID. Do not make a new payment.
const status = await client.execution(id);`}</pre>
        <p className="mt-4 text-sm leading-7">
          For your signer, use{" "}
          <code>
            purchaseWithSigner({"{ id, approvalId, approval, signer }"})
          </code>
          . The local approval is independently checked before signing. Advanced
          clients can call <code>prepare</code> and <code>submit</code>{" "}
          separately.
        </p>
        <pre className={code}>{`POST /api/v1
Authorization: Bearer <agent key>
Content-Type: application/json

{"action":"execute","id":"<persisted UUID>","approvalId":"<approved UUID>"}`}</pre>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          Agent operations: inspect, execute, prepare-external, submit-external,
          execution, balance, cancel and reconcile. An uncertain or submitting
          payment retains its budget until an actual USDC transfer and nonce are
          reconciled. A valid signature can still be submitted by someone who
          already possesses it after an app-level revocation.
        </p>
      </section>
      <section className="mt-12" id="buy-name">
        <h2 className="text-2xl font-medium">
          Example: buy a subname for a recipient
        </h2>
        <p className="mt-4 text-sm leading-7">
          Approve the ENS service pointing to /api/merchant/register. Purchase
          with a JSON POST order. The merchant settles Base Sepolia USDC and
          registers the native Sepolia subname directly to the recipient. No
          resolver is included, so the merchant retains no resolver
          administrator role.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-xl border bg-muted/30 p-5 text-xs leading-6">
          <code>{`await client.purchase({
  id: crypto.randomUUID(), approvalId,
  request: { method: "POST", body: JSON.stringify({
    orderId: crypto.randomUUID(),
    label: "alice", recipient: "0x..."
  }) }
});`}</code>
        </pre>
        <p className="mt-4 text-sm leading-7">
          Keep both IDs when recovering. Check GET
          /api/merchant/registration-orders/&lt;orderId&gt; for payment and
          registration transactions. A paid but incomplete order requires
          operator recovery, never another payment. Setup needs an enabled
          parent registry, a funded Sepolia worker with ROLE_REGISTRAR, a
          published service and a Base Sepolia USDC payer. This is a subname
          purchase, not arbitrary .eth registration.
        </p>
      </section>
      <section className="mt-12">
        <h2 className="text-2xl font-medium">Run the core yourself</h2>
        <p className="mt-4 leading-7 text-muted-foreground">
          Use <code>@ens402/sdk/ens</code>, <code>/http</code>,{" "}
          <code>/intercepta</code> and an independent signer. Your
          infrastructure supplies authentication, request transport, nonce
          persistence and settlement checks. Neither our database nor a Privy
          account is required for the core. A Skill explains this workflow to an
          agent; code and wallet policies enforce it.
        </p>
      </section>
      <section id="names" className="mt-12 scroll-mt-28">
        <h2 className="text-2xl font-medium">
          Publish kevinweather.ens402.eth
        </h2>
        <p className="mt-4 leading-7 text-muted-foreground">
          This is a planned namespace until its parent and registrar are
          configured. For the demo, register the parent on ENSv2 Sepolia at{" "}
          <a
            href="https://app.ens.dev"
            className="text-primary underline"
            target="_blank"
            rel="noreferrer"
          >
            app.ens.dev
          </a>
          . A mainnet registration at app.ens.domains is a separate asset and is
          not required to run the testnet demo.
        </p>
        <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm leading-7">
          <li>
            Register the testnet parent and retain its owner wallet with Sepolia
            ETH.
          </li>
          <li>
            Deploy a native UserRegistry for its children. Point the parent at
            that registry.
          </li>
          <li>
            Deploy ServiceRegistrar for that exact parent and grant it only
            native ROLE_REGISTRAR.
          </li>
          <li>
            Configure ENS_PARENT_NAME and SERVICE_REGISTRAR_ADDRESS on the
            platform.
          </li>
          <li>
            Each user commits, waits at least 60 seconds, then registers their
            service. The transaction publishes records, grants the separate
            operators, and relinquishes the registrar’s resolver privileges
            atomically.
          </li>
        </ol>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          Current native setter permissions are per key within a resolver. Every
          service gets its own resolver. Owners retain text administration and
          resolver-pointer authority; parent administrators and ancestor expiry
          remain trust boundaries. Registrations have a fixed namespace expiry
          and no platform renewal flow yet. These names do not certify service
          quality.
        </p>
        <Link
          href="/register"
          className="mt-5 inline-block text-primary underline"
        >
          Open service registration
        </Link>
      </section>
      <section className="mt-12">
        <h2 className="text-2xl font-medium">What runs where?</h2>
        <div className="mt-5 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-3">Component</th>
                <th className="p-3">Responsibility</th>
              </tr>
            </thead>
            <tbody>
              {[
                [
                  "ENS contracts on Sepolia",
                  "Public records, native ownership and EAC write permissions",
                ],
                [
                  "ENS402 on Vercel",
                  "Authentication, ownership checks, verification, screening, execution and reconciliation",
                ],
                [
                  "Neon PostgreSQL",
                  "User-wallet associations, hashed agent keys, daily reservations and decision records",
                ],
                [
                  "Privy",
                  "Login verification, hosted private keys and per-signature policy enforcement",
                ],
                ["Your signer", "User-controlled signing in the external mode"],
                [
                  "Merchant / facilitator",
                  "Accept x402 payment, settle on Base Sepolia, deliver the API response",
                ],
              ].map(([a, b]) => (
                <tr className="border-b" key={a}>
                  <td className="p-3 font-medium">{a}</td>
                  <td className="p-3 leading-7 text-muted-foreground">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="mt-10 text-sm text-muted-foreground">
        Testnet prototype. A running login screen does not prove a funded
        end-to-end payment. See SETUP.md, IMPLEMENTATION.md and USER-TODO.md in
        the repository for deployment gates and validation evidence.
      </p>
    </article>
  );
}
