import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, KeyRound, Wallet, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ServicePreview } from '@/components/service-preview';

export default function Home() {
  return <div className="hero-wash">
    <section className="editorial-hero pb-14 pt-16 text-center sm:pb-20 sm:pt-24">
      <div className="hero-emblem" aria-label="ENS402">ENS<span className="italic">402</span></div><p className="eyebrow mt-8 px-5 leading-5">Public configuration. Safer agent payments.</p>
      <h1 className="display-title mx-auto mt-6 max-w-5xl px-5">Let agents find services.<br/><span className="text-primary">Verify where they pay.</span></h1>
      <p className="hero-copy mx-auto mt-8 max-w-2xl px-5 text-muted-foreground">An API can ask for payment. ENS402 checks its bill against the merchant’s public ENS records before your agent signs.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3"><Button asChild size="lg"><Link href="/console">Open console <ArrowRight aria-hidden="true"/></Link></Button><Button asChild size="lg" variant="outline"><a href="#stack">Watch the flow</a></Button></div>
      <div className="mx-auto mt-10 flex max-w-xl flex-wrap items-center justify-center gap-x-8 gap-y-4 rounded-2xl border bg-card/70 px-6 py-4"><span className="text-xs text-muted-foreground">Built with</span><a href="https://ens.domains" aria-label="ENS: public service configuration" className="flex items-center"><Image src="/brands/ens.svg" alt="ENS" width={73} height={32}/></a><a href="https://intercepta.io" className="flex items-center gap-2.5 font-semibold"><Image src="/brands/intercepta.svg" alt="" width={19} height={26}/>Intercepta</a><span className="text-sm font-medium text-muted-foreground">x402 payments</span></div>
    </section>
    <section id="stack" className="section-shell pb-16 sm:pb-24"><ServicePreview/></section>
    <section className="border-y bg-card/40"><div className="section-shell py-14 sm:py-20"><div className="max-w-2xl"><p className="eyebrow">Why ENSv2?</p><h2 className="section-title mt-5">Give an agent the URL key.<br/><span className="text-primary">Keep the money key.</span></h2><p className="mt-6 text-lg leading-7 text-muted-foreground">The API can move without handing its operator control of the payment record. Native ENS permissions enforce who can change each field.</p></div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">{[
        {Icon:KeyRound,title:'API operator',record:'agent-endpoint[x402]',body:'Updates the API URL. Cannot edit payment settings with this permission.'},
        {Icon:Wallet,title:'Treasury',record:'ens402.payment',body:'Updates the recipient. Buyers must approve a changed destination.'},
        {Icon:ShieldCheck,title:'Administrator',record:'Native ENSv2 EAC',body:'Grants and revokes permissions. Broader administrator powers remain.'},
      ].map(({Icon,title,record,body})=><div key={title} className="permission-card rounded-2xl border border-transparent p-7"><Icon className="size-5 text-primary" aria-hidden="true"/><h3 className="mt-5 font-heading text-4xl tracking-tight">{title}</h3><p className="mt-2 break-all font-mono text-xs text-primary">{record}</p><p className="mt-5 text-base leading-7 text-muted-foreground">{body}</p></div>)}</div>
    </div></section>
    <section className="section-shell py-14 sm:py-20"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center"><div><h2 className="font-heading text-4xl tracking-tight sm:text-5xl">Your agent. Your wallet. One extra check.</h2><p className="mt-5 max-w-xl text-lg leading-7 text-muted-foreground">Keep your discovery logic and connect your signer. Privy is our demo default; ENS402’s core works with other wallet adapters.</p></div><Button asChild variant="outline"><Link href="/architecture">Explore the architecture <ArrowRight aria-hidden="true"/></Link></Button></div><p className="mt-8 border-t pt-5 text-xs leading-6 text-muted-foreground">Testnet prototype · Native ENS and USDC tested on Anvil forks · Intercepta live scan verified · Live Privy signing verified · Funded public-testnet demo pending. <Link className="text-primary underline underline-offset-4" href="/architecture#status">Evidence & limitations</Link></p></section>
  </div>;
}
