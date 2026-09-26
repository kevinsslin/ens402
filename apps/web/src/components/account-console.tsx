'use client';
import { useState } from 'react';
import { PrivyProvider, usePrivy, useWallets } from '@privy-io/react-auth';
import { baseSepolia, sepolia } from 'viem/chains';
import { Button } from '@/components/ui/button';
import { RegistrationConsole } from './registration-console';
import { OperatorConsole } from './operator-console';

type Registration = {registrar:string;parent:string};
function AccountWorkspace({registration}:{registration?:Registration}) {
  const { ready, authenticated, login, logout, getAccessToken, user, connectWallet } = usePrivy();
  const { wallets } = useWallets();
  const [selected, setSelected] = useState('');
  const wallet = wallets.find(w=>w.address === selected) ?? wallets[0];
  if (!ready) return <div className="section-shell py-20" role="status">Loading secure sign-in…</div>;
  if (!authenticated) return <section className="section-shell py-20"><p className="eyebrow">Your agent workspace</p><h1 className="mt-4 text-4xl font-medium">You set the limits.<br/>Your agent makes the requests.</h1><p className="mt-6 max-w-xl leading-7 text-muted-foreground">Sign in with email or a wallet. Choose a managed agent wallet or keep signing with your own wallet. All payments use Base Sepolia test USDC.</p><Button className="mt-8" onClick={()=>login()}>Sign in with Privy</Button><a href="/docs" className="ml-5 text-sm text-primary underline">Read the integration guide</a></section>;
  return <><div className="section-shell flex flex-wrap items-center justify-between gap-3 border-b py-5"><p className="text-sm">{user?.email?.address || 'Your private workspace'}</p><div className="flex flex-wrap items-center gap-2">{wallets.length>0&&<label className="text-xs">Signing wallet<select aria-label="Signing wallet" className="ml-2 max-w-52 rounded-md border bg-background p-2" value={wallet?.address ?? ''} onChange={e=>setSelected(e.target.value)}>{wallets.map(w=><option key={`${w.address}-${w.walletClientType}`} value={w.address}>{w.address.slice(0,8)}…{w.address.slice(-6)}</option>)}</select></label>}<Button variant="outline" onClick={()=>connectWallet()}>Connect a signing wallet</Button><Button variant="ghost" onClick={()=>logout()}>Sign out</Button></div></div>{registration?<RegistrationConsole {...registration} getProvider={async()=>{if(!wallet)throw new Error('Connect a signing wallet first.');return wallet.getEthereumProvider();}}/>:<OperatorConsole key={`${user?.id}:${wallet?.address ?? ''}`} account={{id:user!.id,getToken:getAccessToken,getProvider:async()=>{if(!wallet)throw new Error('Connect a signing wallet first.');return wallet.getEthereumProvider();}}}/> }</>;
}
export function AccountConsole({ appId, registration }: { appId: string; registration?:Registration }) {
  return <PrivyProvider appId={appId} config={{loginMethods:['email','wallet'],appearance:{theme:'light',accentColor:'#0054cc'},defaultChain:baseSepolia,supportedChains:[baseSepolia,sepolia]}}><AccountWorkspace registration={registration}/></PrivyProvider>;
}
