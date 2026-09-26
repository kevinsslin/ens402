import {it,expect,vi,afterEach} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const {purchase}=vi.hoisted(()=>({purchase:vi.fn()}));
vi.mock('../../packages/sdk/src/http',()=>({purchaseResource:purchase}));
import {directApproval,directPay,type Quote} from './direct';
import {NETWORK,USDC} from '../../packages/sdk/src/index';
const quote={service:{name:'bounty-info.ethglobal.ens402.eth',endpoint:'https://example.com/bounty',status:'active',authority:'chain-identity',block:'1',observedAt:1,payment:{version:2,scheme:'exact',network:NETWORK,asset:USDC,payTo:`0x${'2'.repeat(40)}`,pricing:{model:'fixed',amount:'10000',unit:'request'}}}} as Quote;
afterEach(()=>vi.resetAllMocks());
it('binds exact quoted price and rejects a lower approved ceiling',()=>{
 expect(directApproval(quote.service,'10000')).toMatchObject({fixedPrice:'10000',maxAmount:'10000',authority:'chain-identity'});
 expect(()=>directApproval(quote.service,'9999')).toThrow('exceeds');
});
it('journals before execution and never executes the same id twice, even after failure',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ens402-direct-'));
 try {
  const input={directory,origin:'https://example.com',name:quote.service.name,id:'11111111-1111-4111-8111-111111111111',maximum:'10000',key:`0x${'11'.repeat(32)}`,quote};
  purchase.mockRejectedValueOnce(Error('interrupted'));
  await expect(directPay(input)).rejects.toThrow('interrupted');
  expect((await directPay(input)).state).toBe('started');
  expect(purchase).toHaveBeenCalledOnce();
  await expect(directPay({...input,name:'other.provider.ens402.eth'})).rejects.toThrow('another service');
 }finally{await rm(directory,{recursive:true,force:true});}
});
