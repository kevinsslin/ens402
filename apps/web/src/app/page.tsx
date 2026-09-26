import Link from 'next/link';
import { ArrowRight, KeyRound, Wallet, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ServicePreview } from '@/components/service-preview';

export default function Home() {
  return <>
    <section className="section-shell pb-12 pt-14 text-center sm:pb-16 sm:pt-20">
      <p className="eyebrow">ENS configuration. Safer agent payments.</p>
      <h1 className="mx-auto mt-6 max-w-4xl text-[clamp(2.6rem,6vw,4.7rem)] font-medium leading-[1.08] tracking-[-.05em]">Let agents find services.<br/><span className="text-primary">Verify where they pay.</span></h1>
      <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-muted-foreground">An API can ask for payment. ENS402 checks its bill against the merchant’s public ENS records before your agent signs.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3"><Button asChild size="lg"><Link href="/console">Open console <ArrowRight aria-hidden="true"/></Link></Button><Button asChild size="lg" variant="outline"><a href="#stack">Watch the flow</a></Button></div>
    </section>
    <section id="stack" className="section-shell pb-16 sm:pb-24"><ServicePreview/></section>
    <section className="border-y bg-card/40"><div className="section-shell py-14 sm:py-20"><div className="max-w-2xl"><p className="eyebrow">Why ENSv2?</p><h2 className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl">Give an agent the URL key.<br/><span className="text-primary">Keep the money key.</span></h2><p className="mt-5 text-sm leading-7 text-muted-foreground">The API can move without handing its operator control of the payment record. Native ENS permissions enforce who can change each field.</p></div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">{[
        {Icon:KeyRound,title:'API operator',record:'agent-endpoint[x402]',body:'Updates the API URL. Cannot edit payment settings with this permission.'},
        {Icon:Wallet,title:'Treasury',record:'ens402.payment',body:'Updates the recipient. Buyers must approve a changed destination.'},
        {Icon:ShieldCheck,title:'Administrator',record:'Native ENSv2 EAC',body:'Grants and revokes permissions. Broader administrator powers remain.'},
      ].map(({Icon,title,record,body})=><div key={title} className="rounded-xl border bg-background p-6"><Icon className="size-5 text-primary" aria-hidden="true"/><h3 className="mt-4 font-medium">{title}</h3><p className="mt-2 break-all font-mono text-xs text-primary">{record}</p><p className="mt-4 text-sm leading-6 text-muted-foreground">{body}</p></div>)}</div>
    </div></section>
    <section className="section-shell py-14 sm:py-20"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center"><div><h2 className="text-2xl font-medium tracking-tight">Your agent. Your wallet. One extra check.</h2><p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">Keep your discovery logic and connect your signer. Privy is our demo default; ENS402’s core works with other wallet adapters.</p></div><Button asChild variant="outline"><Link href="/architecture">Explore the architecture <ArrowRight aria-hidden="true"/></Link></Button></div><p className="mt-8 border-t pt-5 text-xs leading-6 text-muted-foreground">Testnet prototype · Native ENS and USDC tested on Anvil forks · Intercepta live scan verified · Live Privy and funded public-testnet demo pending. <Link className="text-primary underline underline-offset-4" href="/architecture#status">Evidence & limitations</Link></p></section>
  </>;
}
