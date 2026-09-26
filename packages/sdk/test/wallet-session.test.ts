import { describe, it, expect, vi } from 'vitest';
import { selectedWallet } from '../../../apps/web/src/components/wallet-session';
const address='0x2222222222222222222222222222222222222222';
function provider(initial='0xaa36a7') {
  let chain=initial;
  return {request:vi.fn(async({method,params}:{method:string;params?:unknown[]})=>{
    if(method==='eth_accounts')return [address];
    if(method==='eth_chainId')return chain;
    if(method==='wallet_switchEthereumChain'){chain=(params![0] as {chainId:string}).chainId;return null;}
    throw new Error('Unexpected wallet prompt');
  })};
}
describe('one wallet session across Console actions',()=>{
  it('reuses a connected wallet with no reconnection or unnecessary network prompt',async()=>{
    const p=provider();expect(await selectedWallet(p,address,'0xaa36a7')).toBe(address);
    expect(p.request.mock.calls.map(([r])=>r.method)).toEqual(['eth_chainId','eth_accounts']);
  });
  it('switches only when the transaction network differs',async()=>{
    const p=provider('0x14a34');expect(await selectedWallet(p,address,'0xaa36a7')).toBe(address);
    expect(p.request.mock.calls.filter(([r])=>r.method==='wallet_switchEthereumChain')).toHaveLength(1);
    expect(p.request.mock.calls.some(([r])=>r.method==='eth_requestAccounts')).toBe(false);
  });
  it('blocks a changed signer instead of reusing a previous simulation',async()=>{
    await expect(selectedWallet(provider(),'0x1111111111111111111111111111111111111111')).rejects.toThrow('account changed');
  });
  it('directs disconnected users to the single wallet control',async()=>{
    await expect(selectedWallet({request:async()=>[]})).rejects.toThrow('top of this page');
  });
  it('does not proceed when a provider fails to switch network',async()=>{
    await expect(selectedWallet({request:async()=> '0x14a34'},address,'0xaa36a7')).rejects.toThrow('did not complete');
  });
});
