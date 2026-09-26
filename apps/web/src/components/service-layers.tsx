import Link from "next/link";
import {
  ArrowDown,
  Check,
  LockKeyhole,
  Search,
  ShieldCheck,
} from "lucide-react";

const card = "min-w-0 rounded-2xl border bg-card p-6";
export function ServiceLayers() {
  return (
    <figure
      aria-label="Discover public service terms, govern edits onchain, guard payment before signing"
      className="my-9"
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <section className={card}>
          <Search className="mb-5 text-primary" aria-hidden="true" />
          <p className="eyebrow">01 / ENS · Read</p>
          <h3 className="mt-2 text-3xl font-medium">Discover</h3>
          <p className="mt-3 text-base leading-7">
            Find what a service does and where to call it.
          </p>
          <div className="mt-5 rounded-xl border bg-background p-4 text-sm leading-7">
            <strong className="block">weather.provider.eth</strong>
            <p>City weather → JSON</p>
            <p className="text-muted-foreground">
              Endpoint · token · recipient · price
            </p>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            A public source that independent catalogs can index. Agents resolve
            the name to get its current terms.
          </p>
          <p className="mt-4 text-xs font-medium text-primary">
            Resolution built · catalog indexer planned
          </p>
        </section>
        <section className={card}>
          <LockKeyhole className="mb-5 text-primary" aria-hidden="true" />
          <p className="eyebrow">02 / Native EAC · Write</p>
          <h3 className="mt-2 text-3xl font-medium">Govern</h3>
          <p className="mt-3 text-base leading-7">
            Control who can change each public setting.
          </p>
          <div className="mt-5 space-y-2 rounded-xl border bg-background p-4 text-sm">
            <p className="flex justify-between gap-2">
              <span>Ops → endpoint</span>
              <Check className="size-4 text-primary" aria-label="Allowed" />
            </p>
            <p className="flex justify-between gap-2">
              <span>Treasury → price / payTo</span>
              <Check className="size-4 text-primary" aria-label="Allowed" />
            </p>
            <p className="border-t pt-2 text-rose-700">
              Ops → payTo: transaction reverts
            </p>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            The ENS contract checks the writer during an edit. Onchain
            transactions and events make changes auditable.
          </p>
          <p className="mt-4 text-xs font-medium text-primary">
            Native allow / deny / revoke tested on forks
          </p>
        </section>
        <section className={card}>
          <ShieldCheck className="mb-5 text-primary" aria-hidden="true" />
          <p className="eyebrow">03 / ENS402 SDK · Pay</p>
          <h3 className="mt-2 text-3xl font-medium">Guard</h3>
          <p className="mt-3 text-base leading-7">
            Check the API’s bill before requesting a signature.
          </p>
          <div className="mt-5 rounded-xl border bg-background p-4 text-sm">
            <div className="grid grid-cols-2 gap-2 text-muted-foreground">
              <span>ENS terms</span>
              <span>HTTP 402</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 font-mono">
              <span>10000</span>
              <span>10000 ✓</span>
            </div>
            <p className="mt-2 border-t pt-2">
              Same chain, token and recipient
            </p>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Match the fixed amount, check buyer limits and Intercepta evidence.
            A mismatch stops this signing flow.
          </p>
          <p className="mt-4 text-xs font-medium text-primary">
            Checks built · raw keys can bypass the SDK
          </p>
        </section>
      </div>
      <figcaption className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary/5 px-5 py-4 text-sm leading-6">
        <span>
          <strong>Price example:</strong> 0.01 USDC × 10⁶ = 10000 atomic units
          on both sides.
        </span>
        <Link
          href="/register/example"
          className="font-medium text-primary underline underline-offset-4"
        >
          Open a filled-in example →
        </Link>
      </figcaption>
    </figure>
  );
}

export function ServiceStructure() {
  return (
    <figure
      className="my-9 rounded-2xl border bg-card p-5 sm:p-8"
      aria-label="Current native registry and resolver setup"
    >
      <div className="flex flex-wrap justify-between gap-3">
        <h3 className="text-2xl font-medium">
          Two contracts. Separate wallet permissions.
        </h3>
        <span className="text-sm text-muted-foreground">
          Implemented · public setup pending
        </span>
      </div>
      <div className="mt-7 grid gap-5 md:grid-cols-[1fr_1fr]">
        <div>
          <div className="rounded-xl border bg-background p-5">
            <p className="eyebrow">Native UserRegistry</p>
            <p className="mt-2 text-xl font-medium">ens402.eth namespace</p>
            <p className="mt-3 text-sm leading-6">
              Name entries: buy · weather · service3
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Each name points to its own resolver.
            </p>
          </div>
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <ArrowDown className="size-4" aria-hidden="true" /> buy name →
            resolver pointer
          </p>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
            <p className="eyebrow">Native PermissionedResolver</p>
            <p className="mt-2 text-xl font-medium">buy.ens402.eth</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Ops writes</dt>
                <dd>Description · picture · API endpoint</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Treasury writes</dt>
                <dd>Fixed price · chain · token · recipient</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Service Admin writes</dt>
                <dd>All records · service status · writer grants</dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="divide-y rounded-xl border px-5">
          {[
            [
              "Namespace owner",
              "Registry root",
              "ROLE_REGISTRAR + ROLE_REGISTRAR_ADMIN",
              "Issue names and manage issuers. A one-time namespace setup responsibility.",
            ],
            [
              "Service Admin",
              "This name + its resolver root",
              "ROLE_SET_RESOLVER; ROLE_SET_TEXT + ROLE_SET_TEXT_ADMIN",
              "Choose the resolver, maintain all text and manage writers. Related name admin roles are listed in Permissions.",
            ],
            [
              "Ops wallet",
              "This resolver, three separate key grants",
              "ROLE_SET_TEXT",
              "Only endpoint, description and avatar. No payment-key grant.",
            ],
            [
              "Treasury wallet",
              "This resolver, ens402.payment key",
              "ROLE_SET_TEXT",
              "Price and payment terms. The payout address may be another wallet.",
            ],
          ].map(([name, scope, role, effect]) => (
            <div key={name} className="py-4">
              <p className="font-medium">
                {name}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  / {scope}
                </span>
              </p>
              <code className="mt-1 block break-words text-xs text-primary">
                {role}
              </code>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {effect}
              </p>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="mt-5 text-sm leading-6 text-muted-foreground">
        Illustrative names and intended grants, not live permissions. The
        paid-name worker separately needs Registry ROLE_REGISTRAR. These ENS
        roles never authorize spending from the buyer’s wallet. Providers can
        use their own supported namespace.
      </figcaption>
    </figure>
  );
}
