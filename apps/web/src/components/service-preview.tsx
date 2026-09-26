'use client';

import { useEffect, useRef, useState } from 'react';
import { NETWORK, USDC, verifyRequest } from '@ens402/sdk';
import { ArrowDown, ArrowLeft, ArrowRight, Check, Globe2, Pause, Play, RotateCcw, ScanLine, ShieldCheck, Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const scenarios = {
  normal: { label: 'Normal payment', path: '/search/v1', recipient: 'Treasury A' },
  moved: { label: 'API moves', path: '/search/v2', recipient: 'Treasury A' },
  mismatch: { label: 'Wrong recipient', path: '/search/v1', recipient: 'Unknown wallet' },
} as const;
type Scenario = keyof typeof scenarios;
const stages = [
  { title: 'Resolve', Icon: Globe2, caption: 'Read public ENS records' },
  { title: 'Verify', Icon: ShieldCheck, caption: 'Compare the API’s bill' },
  { title: 'Screen', Icon: ScanLine, caption: 'Check address risk' },
  { title: 'Sign', Icon: Wallet, caption: 'Ask your wallet to sign' },
];
export function ServicePreview() {
  const [selected,setSelected]=useState<Scenario>('normal');
  const [step,setStep]=useState(0);
  const [playing,setPlaying]=useState(false);
  const [reducedMotion,setReducedMotion]=useState(false);
  const panel=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
    const update=()=>{setReducedMotion(preference.matches);if(preference.matches)setPlaying(false);};
    update();preference.addEventListener('change',update);
    const pause=()=>{if(document.hidden)setPlaying(false);};
    document.addEventListener('visibilitychange',pause);
    const observer=new IntersectionObserver(([entry])=>{if(entry&&!entry.isIntersecting)setPlaying(false);});
    if(panel.current)observer.observe(panel.current);
    return ()=>{preference.removeEventListener('change',update);document.removeEventListener('visibilitychange',pause);observer.disconnect();};
  },[]);
  const current=scenarios[selected];
  const payTo='0x2222222222222222222222222222222222222222';
  const endpoint=`https://api.dataco.com${current.path}`;
  const decision=verifyRequest({name:'search.dataco.eth',endpoint,status:'active',authority:'fixture',block:'fixture',observedAt:1000,payment:{version:1,scheme:'exact',network:NETWORK,asset:USDC,payTo}},endpoint,
    {scheme:'exact',network:NETWORK,asset:USDC,payTo:selected==='mismatch'?'0x3333333333333333333333333333333333333333':payTo,amount:'10000',maxTimeoutSeconds:60,extra:{name:'USDC',version:'2'}},
    {name:'search.dataco.eth',authority:'fixture',endpoints:['https://api.dataco.com/search/v1','https://api.dataco.com/search/v2'],payTo,maxAmount:'10000',expiresAt:1600},1000);
  const blocked=decision.outcome!=='continue';
  const last=blocked?1:3;
  const stopped=blocked&&step===1;
  useEffect(()=>{
    if(!playing||reducedMotion)return;
    if(step>=last){setPlaying(false);return;}
    const timer=setTimeout(()=>setStep(value=>value+1),4200);
    return ()=>clearTimeout(timer);
  },[playing,step,last,reducedMotion]);
  function choose(key:Scenario){setSelected(key);setStep(0);setPlaying(false);}
  const descriptions=[
    selected==='moved'?'The name stays the same. ENS now points to the new, buyer-approved API URL.':'The agent resolves search.dataco.eth to find its API and published payment settings.',
    blocked?'The API asks for an unknown wallet. It does not match Treasury A in ENS. Stop before signing.':'The API asks for 0.01 USDC to Treasury A. Recipient, token, network and buyer limits match.',
    'Intercepta checks the recipient. In this example, fresh evidence contains no risk signals. Missing or flagged evidence would stop the flow.',
    'All checks pass. Request a payment signature from the approved wallet. Settlement and delivery are verified afterwards.',
  ];
  return <div ref={panel} className="flow-panel overflow-hidden rounded-3xl border bg-card">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-7"><p className="text-sm font-medium">See what happens before a payment.</p><Badge variant="outline">Interactive example · no payment</Badge></div>
    <div className="flex flex-wrap gap-2 px-5 pt-5 sm:px-7" role="group" aria-label="Payment scenario">{(Object.keys(scenarios) as Scenario[]).map(key=><Button key={key} size="sm" className="min-h-11 rounded-full px-4" variant={selected===key?'secondary':'ghost'} aria-pressed={selected===key} onClick={()=>choose(key)}>{scenarios[key].label}</Button>)}</div>
    <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[.9fr_1.1fr] lg:gap-12">
      <div className="rounded-2xl border bg-background p-5 sm:p-6"><p className="eyebrow">Public ENS configuration</p><p className="mt-4 break-all text-xl font-semibold tracking-tight text-primary">search.dataco.eth</p><dl className="mt-6 space-y-4 text-sm"><div><dt className="text-xs text-muted-foreground">API URL</dt><dd key={current.path} className="flow-enter mt-1 break-all font-mono">api.dataco.com<span className={selected==='moved'?'text-primary':''}>{current.path}</span></dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Recipient</dt><dd>Treasury A</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">Payment</dt><dd>USDC · Base Sepolia</dd></div></dl><div className="my-5 flex justify-center"><ArrowDown className="size-4 text-muted-foreground" aria-hidden="true"/></div><div className={`rounded-lg border p-4 ${blocked?'border-destructive/40':'border-primary/30'}`}><p className="text-xs text-muted-foreground">The API’s HTTP 402 bill</p><p className="mt-2 flex items-center justify-between gap-3 text-sm"><span>0.01 USDC</span><ArrowRight className="size-4 shrink-0" aria-hidden="true"/><span className={blocked?'text-destructive':'text-primary'}>{current.recipient}</span></p></div></div>
      <div className="flex min-w-0 flex-col justify-center"><ol className="grid grid-cols-4 gap-2" aria-label="Payment checks">{stages.map(({title,Icon,caption},i)=><li key={title}><button type="button" disabled={i>last} aria-current={step===i?'step':undefined} aria-label={`${title}: ${caption}`} onClick={()=>{setPlaying(false);setStep(i);}} className={`flex w-full flex-col items-center gap-3 rounded-xl border px-1 py-4 text-xs transition-colors sm:text-sm ${stopped&&i===1?'border-destructive/40 bg-destructive/5 text-destructive':step===i?'border-primary/40 bg-secondary text-primary':i<step?'border-transparent text-primary':'border-transparent text-muted-foreground'} disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-primary`}>{i<step?<Check className="size-5" aria-hidden="true"/>:stopped&&i===1?<X className="size-5" aria-hidden="true"/>:<Icon className="size-5" aria-hidden="true"/>}{title}</button></li>)}</ol>
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-secondary" aria-hidden="true"><div className={`h-1 rounded-full transition-[width] duration-500 ${stopped?'bg-destructive':'flow-connector'}`} style={{width:`${(step+1)*25}%`}}/></div>
        <div aria-live="polite" aria-atomic="true" className="min-h-48 pt-7 sm:min-h-44"><div key={`${selected}-${step}`} className="flow-enter"><p className="mb-3 font-mono text-xs text-muted-foreground">STEP {step+1} OF 4{stopped?' · STOPPED':''}</p><p className={`flex items-center gap-2 text-lg font-medium ${blocked&&step===1?'text-destructive':''}`}>{blocked&&step===1?<X className="size-5" aria-hidden="true"/>:step===3?<Check className="size-5 text-primary" aria-hidden="true"/>:null}{blocked&&step===1?'Recipient mismatch. No signature.':step===3?'Checks passed. Ready to sign.':stages[step]!.caption}</p><p className="mt-3 text-sm leading-7 text-muted-foreground">{descriptions[step]}</p></div></div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          {!reducedMotion&&<Button className="min-h-11 min-w-32" variant="outline" onClick={()=>{if(playing){setPlaying(false);return;}if(step===last)setStep(0);setPlaying(true);}}>{playing?<><Pause aria-hidden="true"/>Pause</>:step===last?<><RotateCcw aria-hidden="true"/>Replay</>:<><Play aria-hidden="true"/>{step>0?'Resume':'Play flow'}</>}</Button>}
          {reducedMotion&&<span className="text-xs text-muted-foreground">Manual walkthrough</span>}
          <div className="flex gap-1"><Button className="min-h-11" variant="ghost" aria-label="Previous step" disabled={step===0} onClick={()=>{setPlaying(false);setStep(value=>value-1);}}><ArrowLeft aria-hidden="true"/></Button><Button className="min-h-11" variant="ghost" disabled={step>=last} onClick={()=>{setPlaying(false);setStep(value=>Math.min(value+1,last));}}>Next <ArrowRight aria-hidden="true"/></Button></div>
        </div>
      </div>
    </div>
    <p className="border-t px-5 py-4 text-xs leading-6 text-muted-foreground sm:px-7">Illustrative ENS, API and risk data. Recipient matching uses the real SDK rules. A match confirms payment configuration, not service quality.</p>
  </div>;
}
