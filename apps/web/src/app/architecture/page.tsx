import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NamespaceArchitecture } from "@/components/namespace-architecture";

const section = "mt-14 border-t pt-9";
const prose = "mt-4 text-sm leading-7 text-muted-foreground";
export default function Architecture() {
  return (
    <article className="section-shell py-12 sm:py-20">
      <Button asChild variant="ghost" className="-ml-3">
        <Link href="/">
          <ArrowLeft aria-hidden="true" />
          Back to ENS402
        </Link>
      </Button>
      <div className="max-w-3xl">
        <p className="eyebrow mt-9">Architecture / sponsor walkthrough</p>
        <h1 className="mt-4 text-4xl font-medium tracking-tight sm:text-5xl">
          Public x402 configuration.
          <br />
          <span className="text-primary">
            Governed updates. Checked payments.
          </span>
        </h1>
        <p className="mt-6 text-base leading-8 text-muted-foreground">
          ENS is the public configuration and discovery foundation. Native EAC
          governs record updates. The ENS402 SDK guards purchases by comparing
          offchain HTTP 402 requests with current ENS records and buyer
          approval. Our Console uses this same core through its backend. Open
          indexing is planned; fixed-price comparison is implemented.
        </p>
      </div>
      <NamespaceArchitecture />
      <section className={section}>
        <p className="eyebrow">01 / A concrete example</p>
        <h2 className="mt-3 text-2xl font-medium">
          A search API moves. Its Treasury does not.
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            [
              "The merchant publishes",
              "DataCo publishes search.dataco.eth. Its endpoint record points to /search/v1; its payment record names Treasury A and USDC on Base Sepolia.",
            ],
            [
              "The agent checks",
              "The API asks for 0.01 USDC. ENS402 verifies the recipient, network and token, then checks the buyer’s approved route, amount and expiry. Intercepta supplies address-risk evidence.",
            ],
            [
              "An update happens",
              "The operator changes the endpoint to /search/v2. An approved client follows it. If the HTTP 402 instead asks for Treasury B, the client stops before requesting a signature.",
            ],
          ].map(([title, body]) => (
            <li key={title} className="rounded-xl border bg-card p-5">
              <h3 className="font-medium">{title}</h3>
              <p className={prose}>{body}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className={section}>
        <Link
          href="/permissions"
          className="mb-5 inline-block text-sm text-primary underline"
        >
          Exact wallet permissions and setup flow →
        </Link>
        <p className="eyebrow">02 / ENS and native EAC</p>
        <h2 className="mt-3 text-2xl font-medium">
          Permissions live in the ENS contract.
        </h2>
        <p className={prose}>
          The tested ENSv2 PermissionedResolver has native permissions scoped by
          setter key. We deploy one resolver per service because these key
          grants span records in the current resolver. The administrator grants
          an operator permission to write the endpoint key. The resolver itself
          rejects attempts to write a different key. ENS402 does not replace
          this with its own role contract.
        </p>
        <div className="mt-6 overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">
              Public ENS configuration and intended writers
            </caption>
            <thead className="bg-card text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Public record</th>
                <th className="p-4 font-medium">What it contains</th>
                <th className="p-4 font-medium">Delegated writer</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                [
                  "description / avatar",
                  "Service description and optional HTTPS picture URL",
                  "Ops, with separate key grants",
                ],
                [
                  "agent-endpoint[x402]",
                  "Current HTTPS API URL",
                  "API operator",
                ],
                [
                  "ens402.payment",
                  "Scheme, network, token, recipient and schema version; v2 includes fixed price per request",
                  "Treasury",
                ],
                [
                  "ens402.status",
                  "active or suspended",
                  "Status administrator",
                ],
              ].map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, i) => (
                    <td
                      key={cell}
                      className={`p-4 ${i === 0 ? "font-mono text-xs text-primary" : "text-muted-foreground"}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={prose}>
          These actor labels describe their jobs, not invented native role
          names. The pinned resolver exposes grantSetterRoles(...) for a
          setter-key resource within that resolver contract. Its broader
          ROLE_SET_TEXT permission can override narrow grants. Production setup
          must inspect administrators, root permissions, upgrades and
          resolver-pointer control.
        </p>
        <details className="mt-5 rounded-lg border p-5">
          <summary className="cursor-pointer text-sm font-medium">
            Technical details and deployment limits
          </summary>
          <div className="mt-4 space-y-4 text-sm leading-7 text-muted-foreground">
            <p>
              The current integration pins contracts-v2 commit 71a3b733 and
              official Sepolia resolver implementation
              0x14f09fd05d4585759e54844dc9b00147131cf243. It uses
              setText(bytes,string,string), grantSetterRoles and revokeRoles.
              Historical 48b3e2d tests remain separate compatibility evidence.
            </p>
            <p>
              The endpoint key follows the extension shape of draft ENSIP-26.
              x402 is our added protocol value; ens402.payment and ens402.status
              are our custom application records. They are not official ENS
              standards.
            </p>
            <p>
              The current fork suite deploys native resolver and registry
              proxies, registers local test names, resolves the current ENS402
              records through Universal Resolver, and tests permissions. Earlier
              manual evidence used arbitrary unregistered nodes and historical
              keys. All these registrations and writes are fork-local, not live
              Sepolia transactions. Revocation blocks later edits; it does not
              erase existing records or cancel issued signatures.
            </p>
          </div>
        </details>
      </section>
      <section id="screening" className={section}>
        <p className="eyebrow">03 / Intercepta</p>
        <h2 className="mt-3 text-2xl font-medium">
          Address-risk evidence, with an explicit decision.
        </h2>
        <p className={prose}>
          Quick Scan Address returns a numeric toxicScore and a list of traits.
          Each trait contains risk, name, txsCount and description. The response
          does not measure API uptime, price or service quality.
        </p>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-5">
            <Badge variant="outline">
              Actual provider response · September 26, 2026 JST
            </Badge>
            <pre className="mt-5 overflow-x-auto text-sm leading-7 text-primary">
              {'{\n  "toxicScore": 0,\n  "traits": []\n}'}
            </pre>
            <p className="mt-4 text-xs leading-6 text-muted-foreground">
              Official documentation example address:{" "}
              <span className="break-all font-mono">
                0x0d775e010f0b6c32c9468d43ba599ef47d596e47
              </span>
              . Historical Ethereum mainnet risk evidence, not a fresh verdict
              for a demo Treasury or a guarantee of safety.
            </p>
          </div>
          <div className="rounded-xl border p-5">
            <h3 className="font-medium">
              Cache the scan. Recheck the payment.
            </h3>
            <p className={prose}>
              The server adapter caches a result for up to one hour, keyed by
              address within its fixed Ethereum mainnet evidence source. A
              different recipient triggers a new scan. Every payment still
              checks current ENS settings and buyer approval.
            </p>
            <p className={prose}>
              An expired cache, malformed response or provider failure holds the
              payment. A scan on Ethereum mainnet is supplementary evidence
              about that address; it does not prove the behavior of a contract
              on Base Sepolia.
            </p>
          </div>
        </div>
        <div className="mt-6 divide-y rounded-xl border">
          {[
            [
              "Reject",
              "known_scammer or sanction_address",
              "Block before signing when the provider returns these direct attributions.",
            ],
            [
              "Hold",
              "Any other trait or nonzero score",
              "Ask for review. Exposure such as sanction_address_communication is not direct sanction attribution. Unknown traits also hold.",
            ],
            [
              "Continue checks",
              "Score 0, no traits, fresh result",
              "No signals returned under this conservative demo policy. ENS and buyer checks must still pass.",
            ],
            [
              "Hold",
              "API error, stale or unsupported evidence",
              "Do not turn missing evidence into a clean result.",
            ],
          ].map(([action, signal, explanation]) => (
            <div
              key={signal}
              className="grid gap-2 p-5 sm:grid-cols-[130px_1fr]"
            >
              <p className="text-sm font-medium text-primary">{action}</p>
              <div>
                <h3 className="break-words text-sm font-medium">{signal}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {explanation}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p className={prose}>
          These are ENS402 demo rules. The provider does not prescribe our
          numeric thresholds. Risky trait examples are documented schema cases;
          they are not claimed live responses.
        </p>
      </section>
      <section id="signing" className={section}>
        <p className="eyebrow">04 / Privy is the demo default</p>
        <h2 className="mt-3 text-2xl font-medium">
          The wallet signs a narrowly described payment.
        </h2>
        <p className={prose}>
          An x402 EIP-3009 authorization says: this payer permits this USDC
          recipient to receive this amount before this expiry, using this nonce.
          The merchant and facilitator can submit it to the token contract.
          Creating a signature is not proof that payment settled or the API
          delivered its result.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-card p-5">
            <h3 className="font-medium">The implemented Privy policy</h3>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              <li>Base Sepolia only, with its specified USDC contract.</li>
              <li>
                One approved recipient and a maximum amount per authorization.
              </li>
              <li>
                An absolute authorization expiry and the exact EIP-712 payment
                type map.
              </li>
              <li>
                A single restrictive ALLOW rule; unmatched signing methods
                default to deny.
              </li>
            </ul>
          </div>
          <div className="rounded-xl border p-5">
            <h3 className="font-medium">
              What still depends on the integrator
            </h3>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
              <li>
                ENS resolution, approval records, risk decisions and request
                scope.
              </li>
              <li>
                The reference backend implements UTC daily reservations,
                idempotent attempts and transaction reconciliation. Other
                integrators must supply equivalent controls.
              </li>
              <li>
                Protecting the Privy app secret and the right to modify
                policies.
              </li>
              <li>
                The current provider passed real allowed-signature and seven
                forbidden-request tests. This does not prove funded settlement.
              </li>
            </ul>
          </div>
        </div>
        <p className={prose}>
          The hosted mode uses the platform Privy account; independent
          integrators can use their own account. The SDK core accepts other
          signers. An agent with an unrestricted key can bypass client checks.
          In this demo setup, the trusted backend holds the app secret and can
          change policies; this is not protection against compromise of that
          backend.
        </p>
        <p className={prose}>
          The landing examples use fixture inputs. The authenticated /console
          connects to real server operations, PostgreSQL, Privy and the
          configured merchant. Users sign in with Privy, create their own
          approvals and issue scoped agent API keys. The separate /operator
          route retains the demo token. Provider secrets stay on the server.
          Self signing uses the user wallet after the same checks, but direct
          payments outside ENS402 can bypass them.
        </p>
      </section>
      <section id="reputation" className={section}>
        <p className="eyebrow">05 / Pitch and Q&A</p>
        <h2 className="mt-3 text-2xl font-medium">How the other pieces fit.</h2>
        <div className="mt-6 space-y-3">
          {[
            [
              "Does EAC prevent a server from changing its bill?",
              "EAC restricts writes to ENS records. It does not control the API server. The SDK detects disagreement between a server’s HTTP 402 and approved ENS settings before requesting a signature. Authorized ENS changes still need to satisfy buyer approval; Admin retains root authority.",
            ],
            [
              "Does ENS automatically route requests to a new endpoint?",
              "An integrated client resolves the name and calls the current endpoint. ENS does not proxy HTTP traffic. Our current SDK checks the URL against buyer-approved endpoints; a new URL outside that scope requires new approval. It also rechecks configuration immediately before signing.",
            ],
            [
              "Does onchain payment create reputation?",
              "Settlement supplies evidence of payment, not proof of service quality. A future integration can link service identity to receipts and ERC-8004 feedback. Feedback remains attached to the registry’s agent identity; names, parents and payout addresses do not automatically inherit a reputation score. Ownership and identity continuity must be verified.",
            ],
            [
              "Does the Console actually use the SDK?",
              "Yes. The hosted backend imports resolveService, purchaseResource, verifyRequest and settlement verification from @ens402/sdk. It adds accounts, approvals, reservations and signer integration. Independent apps can integrate the SDK core in their own runtime; the hosted API client is a separate integration option.",
            ],
            [
              "Has ENS already explored discovery?",
              "Yes. Draft ENSIP-26 defines agent context and endpoint records; draft ENSIP-27 describes node classification and metadata schemas. ENSv2 also documents indexing. ENS402 builds on these foundations for x402 service publication, independent catalog reconstruction, scoped updates and payment checks. We do not claim to invent ENS discovery.",
            ],
            [
              "How is this different from Bazaar?",
              "Coinbase operates a hosted Bazaar catalog, while the Bazaar extension is an open specification that other facilitators can implement. ENS402 proposes publicly observable ENS publication so another indexer can reconstruct a catalog without access to that operator’s private database. The indexer still runs offchain; the source records and edit authority are onchain.",
            ],
            [
              "Does every provider need an ens402.eth subname?",
              "No. Multi-namespace indexing is part of the proposed design. Our parent would offer an onboarding path; providers could use their own supported ENS registries. Supported roots, bootstrap rules and lifecycle handling must be defined before claiming complete discovery.",
            ],
            [
              "Who should change prices?",
              "Treasury controls price together with the payment tuple. Ops edits descriptions, pictures and endpoints with separately scoped text-key grants. Service Admin retains root authority and manages grants. Fixed-price publication and comparison are implemented; a published price does not force an API to honor it.",
            ],
            [
              "Why not just implement HTTP 402?",
              "That lets a server request payment. ENS402 adds a separately controlled public configuration source so the client can check whether that request matches the merchant identity and payment settings it accepted.",
            ],
            [
              "Why ENS?",
              "ENS already gives names a widely integrated, publicly resolvable home. ENSv2’s native permissions let separate keys maintain separate records. ENS402 clients add support for our service configuration schema; existing wallets do not automatically understand these custom fields.",
            ],
            [
              "What does World do?",
              "An optional future approval flow can verify the returning human when an application asks to expand payment permissions. The app must still collect explicit consent and change the actual wallet policy. World proof alone does not authorize a payment. It is not required by the current SDK.",
            ],
            [
              "Where does ERC-8004 fit?",
              "It can help the agent evaluate candidates before ENS402 checks payment. Feedback belongs to a chain, identity registry and agentId, not simply an API URL or recipient address. ENS could link to that identity, but reputation aggregation under a parent name would be additional application logic. This is pitch context, not current implementation.",
            ],
            [
              "Does a matching request guarantee a good service?",
              "No. It establishes consistency with approved configuration. Address screening and service reputation supply different evidence; neither guarantees delivery.",
            ],
          ].map(([question, answer]) => (
            <details key={question} className="rounded-lg border p-5">
              <summary className="cursor-pointer text-sm font-medium">
                {question}
              </summary>
              <p className={prose}>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section id="status" className={section}>
        <p className="eyebrow">06 / Evidence and remaining gates</p>
        <h2 className="mt-3 text-2xl font-medium">
          Implemented is different from live-verified.
        </h2>
        <div className="mt-6 space-y-4">
          {[
            [
              "Planned discovery layer",
              "Provider registry hierarchy, provider-owned namespace indexing and rich call-format schemas remain design scope. Description, optional picture and fixed-price publication/comparison are implemented. Independent catalog reconstruction has not yet been implemented or demonstrated.",
            ],
            [
              "Tested on an isolated fork",
              "Native proxy deployment, fork-local name registration and Universal Resolver lookup, endpoint grants, forbidden payment/status writes, sibling isolation, self-grant rejection, Treasury rotation, revocation, root override and ancestor expiry. No live ENS deployment is claimed.",
            ],
            [
              "Implemented and locally tested",
              "SDK request and signature checks, the actual HTTP 402 exchange, on-chain settlement-proof validation, authenticated APIs, merchant routes, concurrent PostgreSQL budget reservations and idempotency. Full backend tests use a real temporary database and simulated external providers; they do not prove live settlement.",
            ],
            [
              "Live provider response observed",
              "Intercepta Quick Scan returned a real response using the configured key. That single observation does not validate every risk classification.",
            ],
            [
              "Pending live integration",
              "Privy signing and provider policy rejection tests passed. The production Neon database is connected and migrated. A registered live service, namespace registrar deployment, human login and funded Base Sepolia payment still need end-to-end validation.",
            ],
          ].map(([title, body]) => (
            <div key={title} className="rounded-xl border p-5">
              <h3 className="text-sm font-medium">{title}</h3>
              <p className={prose}>{body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className={section}>
        <h2 className="text-xl font-medium">Primary sources</h2>
        <ul className="mt-5 space-y-3 text-sm">
          {[
            [
              "ENSv2 pinned contracts",
              "https://github.com/ensdomains/contracts-v2/tree/71a3b7339dbc55ab47667abdfe8303bac4f4c24e",
            ],
            [
              "ENSIP-26 agent text records (draft)",
              "https://docs.ens.domains/ensip/26",
            ],
            [
              "ENSIP-27 node classification and metadata (draft)",
              "https://docs.ens.domains/ensip/27",
            ],
            ["ENSv2 indexing guide", "https://docs.ens.domains/ensv2/indexing"],
            [
              "Bazaar open extension specification",
              "https://github.com/coinbase/x402/blob/main/specs/extensions/bazaar.md",
            ],
            [
              "Intercepta Quick Scan Address schema",
              "https://docs.web3antivirus.io/reference/quick-scan-address",
            ],
            [
              "Privy Ethereum policy examples",
              "https://docs.privy.io/controls/policies/example-policies/ethereum",
            ],
            [
              "x402 EVM exact payment scheme",
              "https://github.com/coinbase/x402/tree/main/typescript/packages/mechanisms/evm",
            ],
            [
              "ERC-8004 specification",
              "https://eips.ethereum.org/EIPS/eip-8004",
            ],
          ].map(([title, href]) => (
            <li key={href}>
              <a
                href={href}
                className="inline-flex items-center gap-2 text-primary underline underline-offset-4"
              >
                {title}
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
