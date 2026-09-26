import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NamespaceArchitecture } from "@/components/namespace-architecture";
import { ServicePreview } from "@/components/service-preview";

export default function Home() {
  return (
    <div className="hero-wash">
      <section className="editorial-hero pb-12 pt-12 text-center sm:pb-14 sm:pt-16">
        <div className="hero-emblem" aria-label="ENS402">
          ENS<span className="italic">402</span>
        </div>
        <p className="eyebrow mt-8 px-5 leading-5">
          Public x402 configuration. Governed updates. Verified payments.
        </p>
        <h1 className="display-title mx-auto mt-6 max-w-5xl px-5">
          Publish your x402 terms.
          <br />
          <span>Check every payment request.</span>
        </h1>
        <p className="hero-copy mx-auto mt-8 max-w-2xl px-5 text-muted-foreground">
          ENS publishes service configuration for discovery. Native EAC controls
          who can change it. The ENS402 SDK checks the actual HTTP 402 against
          those records and buyer limits before requesting a signature.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/console">
              Open console <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#discovery">See how it works</a>
          </Button>
        </div>
        <div className="mx-auto mt-10 flex max-w-xl flex-wrap items-center justify-center gap-x-8 gap-y-4 rounded-2xl border bg-card/70 px-6 py-4">
          <span className="text-xs text-muted-foreground">Built with</span>
          <a
            href="https://ens.domains"
            aria-label="ENS: public service configuration"
            className="flex items-center"
          >
            <Image src="/brands/ens.svg" alt="ENS" width={73} height={32} />
          </a>
          <a
            href="https://intercepta.io"
            className="flex items-center gap-2.5 font-semibold"
          >
            <Image src="/brands/intercepta.svg" alt="" width={19} height={26} />
            Intercepta
          </a>
          <span className="text-sm font-medium text-muted-foreground">
            x402 payments
          </span>
        </div>
      </section>
      <section id="discovery" className="section-shell py-12 sm:py-16">
        <div className="grid gap-6 md:grid-cols-[1fr_1.1fr] md:gap-14">
          <div><p className="eyebrow">Discover. Govern. Guard.</p><h2 className="mt-4 font-heading text-4xl tracking-tight sm:text-5xl">One public configuration. Three connected layers.</h2></div>
          <p className="text-base leading-8 text-muted-foreground">Publish what a service does, where it runs and how it gets paid under an ENS name. The same records support independent discovery, accountable updates and payment checks. The SDK brings these checks into an agent’s existing purchase flow.</p>
        </div>
        <ol className="mt-9 grid gap-6 md:grid-cols-3">
          {[
            ["01 / ENS", "Discovery layer", "Public service records let independent indexers reconstruct a catalog from supported namespaces. Agents can choose an index, then resolve the selected name directly.", "Open indexing and description publishing planned"],
            ["02 / NATIVE EAC", "Governance layer", "Ops maintains the API and description. Treasury manages payment terms. Admin grants and revokes access. ENS records and events make configuration changes traceable.", "Native key-scoped permissions tested on forks"],
            ["03 / ENS402 SDK", "Guard layer", "Compare the offchain HTTP 402 with current onchain settings and buyer approval. Check the recipient, token, network and permitted amount before calling the signer.", "Verification core implemented; published-price comparison planned"],
          ].map(([number, title, body, status]) => <li key={number} className="border-t pt-5"><p className="font-mono text-sm text-primary">{number}</p><h3 className="mt-3 text-xl font-medium">{title}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p><p className="mt-4 text-xs leading-5 text-muted-foreground">{status}</p></li>)}
        </ol>
        <p className="mt-8 max-w-4xl text-sm leading-7 text-muted-foreground">An indexer can filter its results; another can still reconstruct the published catalog for the same supported namespaces and block. Public records do not guarantee search completeness, service quality or delivery.</p>
        <Link href="/architecture#reputation" className="mt-4 inline-block text-sm text-primary underline underline-offset-4">Built on ENS discovery foundations. See what ENS402 adds →</Link>
      </section>
      <section id="use-cases" className="section-shell pb-14 sm:pb-20">
        <p className="eyebrow">What this changes</p>
        <h2 className="mt-4 font-heading text-4xl tracking-tight sm:text-5xl">A directory you can rebuild. A request you can check.</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {[
            ["A directory drops a listing", "Another indexer can reconstruct the published catalog from the same supported ENS roots and history. Providers can use their own namespace.", "Planned indexer demonstration"],
            ["An API moves to a new URL", "Ops updates its endpoint record. An integrated client resolves the new URL and continues if it is within the buyer’s approved scope; otherwise it asks for approval.", "ENS resolution and scope checks implemented"],
            ["An API asks for a different recipient", "The SDK detects that the HTTP 402 disagrees with the published payment settings and stops this purchase before requesting a signature.", "Implemented recipient comparison"],
            ["A server silently raises the price", "For the proposed fixed-price model, the SDK will compare the requested amount with the published unit price. Extra fees or dynamic pricing require explicit rules and consent.", "Price publication and comparison planned; buyer amount limits exist"],
          ].map(([title, body, status]) => <article key={title} className="rounded-xl border bg-card p-6"><h3 className="text-lg font-medium">{title}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p><p className="mt-4 text-xs leading-5 text-muted-foreground">{status}</p></article>)}
        </div>
      </section>
      <section id="stack" className="section-shell pb-16 sm:pb-24">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">After an agent chooses a service</p>
            <h2 className="mt-3 font-heading text-3xl sm:text-4xl">
              One payment. Six clear steps.
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-6 text-muted-foreground">
            Explore the current verification flow. Discovery and advertised-price
            comparison are the next layer.
          </p>
        </div>
        <ServicePreview />
      </section>
      <section id="architecture" className="border-y bg-card/40">
        <div className="section-shell py-14 sm:py-20">
          <div className="max-w-2xl">
            <p className="eyebrow">Architecture / ENSv2 native permissions</p>
            <h2 className="section-title mt-5">
              Make the service public.
              <br />
              <span>Keep each edit accountable.</span>
            </h2>
            <p className="mt-6 text-lg leading-7 text-muted-foreground">
              Ops maintains the description and API. Treasury owns pricing and
              payment settings. Admin manages their grants. The proposed records
              below show what an indexer and a paying agent need to read.
            </p>
          </div>
          <NamespaceArchitecture />
          <Link
            href="/permissions"
            className="mt-6 inline-flex items-center gap-2 text-sm text-primary underline underline-offset-4"
          >
            View the exact roles and setup flow{" "}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
      <section id="integration" className="section-shell py-14 sm:py-20">
        <p className="eyebrow">Reference app + reusable SDK</p>
        <h2 className="mt-4 font-heading text-4xl tracking-tight sm:text-5xl">Our Console uses the same verification core.</h2>
        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border p-6"><h3 className="text-lg font-medium">ENS402 Console</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">The Console calls our backend, which imports the SDK to resolve ENS, check HTTP 402, screen risk and run the purchase flow. The backend adds user accounts, approvals and budget tracking; Privy is the managed demo signer.</p><p className="mt-4 font-mono text-xs leading-6 text-primary">Console → Backend → ENS402 SDK → Signer</p></div>
          <div className="rounded-xl border p-6"><h3 className="text-lg font-medium">Your agent or app</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">Use the SDK core in your runtime with your own resolver, screening and signer integrations. Our hosted service is optional. Client checks cannot constrain a wallet that signs outside that flow.</p><p className="mt-4 font-mono text-xs leading-6 text-primary">Your app → ENS402 SDK → Your signer</p></div>
        </div>
        <div className="mt-5 flex flex-wrap gap-5 text-sm text-primary"><Link className="underline underline-offset-4" href="/console">Try the reference Console</Link><Link className="underline underline-offset-4" href="/docs">Read the SDK integration guide</Link></div>
      </section>
      <section className="section-shell py-14 sm:py-20">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-heading text-4xl tracking-tight sm:text-5xl">
              Public records. Your search. Your signer.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-7 text-muted-foreground">
              Bring your own selection logic and wallet. The verification core works
              independently of our proposed directory. Privy is the demo signer.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/architecture">
              Explore the architecture <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <p className="mt-8 border-t pt-5 text-xs leading-6 text-muted-foreground">
          Testnet prototype · Open indexing, description publishing and price
          verification are planned · Native ENS and USDC tested on Anvil forks ·
          Intercepta live scan verified · Live Privy signing verified · Funded
          public-testnet demo pending.{" "}
          <Link
            className="text-primary underline underline-offset-4"
            href="/architecture#status"
          >
            Evidence & limitations
          </Link>
        </p>
      </section>
    </div>
  );
}
