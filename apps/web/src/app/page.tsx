import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiscoveryComparison } from "@/components/discovery-comparison";
import { LandingLayers } from "@/components/landing-layers";
import { NamespaceArchitecture } from "@/components/namespace-architecture";

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
          <span>Verify before your agent pays.</span>
        </h1>
        <p className="hero-copy mx-auto mt-8 max-w-2xl px-5 text-muted-foreground">
          A public discovery layer for x402 services. Govern configuration with ENSv2 EAC. Guard payments with the SDK.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/console">
              Open console <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#architecture">See how it works</a>
          </Button>
        </div>
        <div className="mx-auto mt-10 flex max-w-3xl flex-wrap items-center justify-center gap-x-7 gap-y-5 rounded-2xl border bg-card/70 px-6 py-5">
          <span className="w-full text-xs text-muted-foreground sm:w-auto">Built with</span>
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
          <a
            href="https://www.curvegrid.com/multibaas"
            aria-label="Curvegrid MultiBaas: ENS governance event indexing"
            className="flex items-center"
          >
            <Image src="/brands/curvegrid.svg" alt="Curvegrid" width={167} height={34} className="h-auto w-[132px]" />
          </a>
          <span className="text-sm font-medium text-muted-foreground">
            x402 payments
          </span>
        </div>
      </section>
      <div className="section-shell pb-12 sm:pb-20">
        <DiscoveryComparison />
      </div>
      <section id="architecture" className="border-y bg-card/40">
        <div className="section-shell py-10 sm:py-14">
          <div className="max-w-2xl">
            <p className="eyebrow">Architecture / ENSv2 native permissions</p>
            <h2 className="mt-4 text-4xl leading-tight sm:text-5xl">
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
      <LandingLayers />
      <section className="border-t bg-card/60">
        <div className="section-shell flex flex-wrap items-center justify-between gap-6 py-10">
          <div><h2 className="text-3xl">Build on public service configuration.</h2><p className="mt-3 text-sm text-muted-foreground">Explore the catalog, publish a service, or bring your own agent and signer.</p></div>
          <div className="flex flex-wrap gap-3"><Button asChild><Link href="/console">Open Console <ArrowRight size={16} /></Link></Button><Button asChild variant="outline"><Link href="/docs">SDK & MCP docs</Link></Button></div>
        </div>
      </section>
    </div>
  );
}
