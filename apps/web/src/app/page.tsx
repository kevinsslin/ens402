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
          Open discovery for x402 services.
        </p>
        <h1 className="display-title mx-auto mt-6 max-w-5xl px-5">
          Publish once on ENS.
          <br />
          <span>Be found by any indexer.</span>
        </h1>
        <p className="hero-copy mx-auto mt-8 max-w-2xl px-5 text-muted-foreground">
          We’re building a service directory anyone can reconstruct from ENS.
          Publish what your service does, what it costs, and where to pay.
          Agents check the payment request before signing.
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
          <div><p className="eyebrow">Public publication. Independent discovery.</p><h2 className="mt-4 font-heading text-4xl tracking-tight sm:text-5xl">A service listing should outlive a directory.</h2></div>
          <p className="text-base leading-8 text-muted-foreground">A hosted catalog decides what appears in its results. With public ENS records, other indexers can independently find and verify a published service. Our design lets providers use their own ENS namespace and lets agents choose which search provider to trust.</p>
        </div>
        <ol className="mt-9 grid gap-6 md:grid-cols-3">
          {[
            ["01", "Publish on ENS", "A provider publishes its description, API URL and payment terms. Native ENSv2 roles control who can edit each record.", "Description and price publishing planned"],
            ["02", "Build any directory", "Independent indexers read the same public registry history and current records. Each can offer its own search, filters and ranking.", "Multi-namespace indexer planned"],
            ["03", "Check before paying", "The agent resolves the chosen name again, compares the actual HTTP 402 with ENS, screens the recipient and asks its signer to pay.", "Verification core implemented; price comparison planned"],
          ].map(([number, title, body, status]) => <li key={number} className="border-t pt-5"><p className="font-mono text-sm text-primary">{number}</p><h3 className="mt-3 text-xl font-medium">{title}</h3><p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p><p className="mt-4 text-xs leading-5 text-muted-foreground">{status}</p></li>)}
        </ol>
        <p className="mt-8 max-w-4xl text-sm leading-7 text-muted-foreground">An indexer can filter its results; another can still reconstruct the published catalog for the same supported namespaces and block. Public records do not guarantee search completeness, service quality or delivery.</p>
        <Link href="/architecture#reputation" className="mt-4 inline-block text-sm text-primary underline underline-offset-4">Built on ENS discovery foundations. See what ENS402 adds →</Link>
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
