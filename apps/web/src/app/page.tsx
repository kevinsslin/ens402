import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiscoveryPipeline } from "@/components/discovery-pipeline";
import { ServiceLayers } from "@/components/service-layers";
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
          Discover. Govern. Guard.
        </p>
        <h1 className="display-title mx-auto mt-6 max-w-5xl px-5">
          Publish your x402 terms.
          <br />
          <span>Check every payment request.</span>
        </h1>
        <p className="hero-copy mx-auto mt-8 max-w-2xl px-5 text-muted-foreground">
          Publish x402 settings on ENS. Control changes with EAC.
          Check every bill before your agent signs.
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
          <div>
            <p className="eyebrow">Discover. Govern. Guard.</p>
            <h2 className="mt-4 font-heading text-4xl tracking-tight sm:text-5xl">
              One service. Three layers.
            </h2>
          </div>
          <p className="text-base leading-8 text-muted-foreground">
            Find the service, control its settings, verify its payment request.
          </p>
        </div>
        <ServiceLayers />
        <DiscoveryPipeline />
      </section>
      <section id="use-cases" className="section-shell pb-14 sm:pb-20">
        <p className="eyebrow">What this changes</p>
        <h2 className="mt-4 font-heading text-4xl tracking-tight sm:text-5xl">
          When things change.
        </h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {[
            [
              "A directory drops a listing",
              "Rebuild the catalog from supported ENS roots and public history.",
              "Independent catalog reconstruction",
            ],
            [
              "An API moves to a new URL",
              "Resolve the new URL from ENS. Ask for approval if it leaves the buyer’s allowed scope.",
              "Resolution + scope checks built",
            ],
            [
              "An API asks for a different recipient",
              "The SDK stops signing when the recipient differs from ENS.",
              "Recipient check built",
            ],
            [
              "A server silently raises the price",
              "A bill that differs from the published fixed price is blocked.",
              "Fixed-price check built",
            ],
          ].map(([title, body, status]) => (
            <article key={title} className="rounded-xl border bg-card p-6">
              <h3 className="text-lg font-medium">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {body}
              </p>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                {status}
              </p>
            </article>
          ))}
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
            Resolve ENS → compare HTTP 402 → screen the recipient → check
            consent → sign → confirm payment.
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
              Each provider manages its services. Each wallet has scoped permissions.
            </p>
          </div>
          <NamespaceArchitecture />
          <Link
            href="/permissions"
            className="mt-6 inline-flex items-center gap-2 text-sm text-primary underline underline-offset-4"
          >
            Roles & setup{" "}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>
      <section id="integration" className="section-shell py-14 sm:py-20">
        <p className="eyebrow">Reference app + reusable SDK</p>
        <h2 className="mt-4 font-heading text-4xl tracking-tight sm:text-5xl">
          Use our Console. Build with our SDK.
        </h2>
        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border p-6">
            <h3 className="text-lg font-medium">ENS402 Console</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Inspect services, set limits and track payments. Privy signs
              managed demo payments.
            </p>
            <p className="mt-4 font-mono text-xs leading-6 text-primary">
              Console → Backend → ENS402 SDK → Signer
            </p>
          </div>
          <div className="rounded-xl border p-6">
            <h3 className="text-lg font-medium">Your agent or app</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Bring your own signer. Add ENS and payment checks to your agent.
              Signing outside this flow bypasses those checks.
            </p>
            <p className="mt-4 font-mono text-xs leading-6 text-primary">
              Your app → ENS402 SDK → Your signer
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-5 text-sm text-primary">
          <Link className="underline underline-offset-4" href="/console">
            Open Console
          </Link>
          <Link className="underline underline-offset-4" href="/docs">
            SDK docs
          </Link>
        </div>
      </section>
      <div className="section-shell pb-10 text-sm text-muted-foreground">
        Testnet prototype · Provider setup and indexing pending.{" "}
        <Link className="text-primary underline underline-offset-4" href="/architecture#status">
          Implementation status
        </Link>
      </div>
    </div>
  );
}
