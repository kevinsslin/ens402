'use client';
import dynamic from 'next/dynamic';
const AccountConsole = dynamic(()=>import('./account-console').then(m=>m.AccountConsole),{ssr:false,loading:()=> <div className="section-shell py-20" role="status">Loading your workspace…</div>});
export function ConsoleLoader({appId,registration}:{appId:string;registration?:{registrar:string;parent:string}}) { return <AccountConsole appId={appId} registration={registration}/>; }
