import {it,expect,vi,afterEach} from 'vitest';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {encodePaymentRequiredHeader,encodePaymentResponseHeader} from '@x402/core/http';
import {NETWORK,USDC} from '../../packages/sdk/src/index';
const f=vi.hoisted(()=>({transport:vi.fn(),verify:vi.fn()}));
vi.mock('../../packages/server/src/transport',()=>({createResourceTransport:()=>f.transport}));
vi.mock('../../packages/sdk/src/settlement',()=>({verifySettlement:f.verify}));
import {directPay,type Quote} from './direct';
afterEach(()=>{vi.unstubAllGlobals();vi.resetAllMocks();});
it.each([false,true])('runs direct SDK checkout with price mismatch=%s',async mismatch=>{
 const directory=await mkdtemp(join(tmpdir(),'ens402-flow-'));const now=Math.floor(Date.now()/1000);
 const recipient=`0x${'2'.repeat(40)}`;
 const quote={service:{name:'bounty-info.ethglobal.ens402.eth',endpoint:'https://example.com/bounty',status:'active',authority:'test-chain',block:'1',observedAt:now,payment:{version:2,scheme:'exact',network:NETWORK,asset:USDC,payTo:recipient,pricing:{model:'fixed',amount:'10000',unit:'request'}}},evidence:{provider:'intercepta',network:'ethereum-mainnet',address:recipient,observedAt:now,expiresAt:now+1000,cached:false,scan:{toxicScore:0,traits:[]}}} as Quote;
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(quote)));
 const requirement={scheme:'exact',network:NETWORK,asset:USDC,payTo:recipient,amount:mismatch?'20000':'10000',maxTimeoutSeconds:60,extra:{name:'USDC',version:'2'}};
 f.transport.mockResolvedValueOnce(new Response(null,{status:402,headers:{'PAYMENT-REQUIRED':encodePaymentRequiredHeader({x402Version:2,resource:{url:quote.service.endpoint},accepts:[requirement]})}}));
 f.transport.mockImplementationOnce(async()=>{
  const saved=JSON.parse(await readFile(join(directory,'11111111-1111-4111-8111-111111111111.json'),'utf8'));
  expect(saved.state).toBe('submitting');expect(saved.authorization.value).toBe('10000');
  return new Response('{"bounties":[]}',{headers:{'PAYMENT-RESPONSE':encodePaymentResponseHeader({success:true,network:NETWORK,transaction:`0x${'ab'.repeat(32)}`,payer:saved.authorization.from})}});
 });
 f.verify.mockResolvedValue(undefined);
 try{
  const input={directory,origin:'https://example.com',name:quote.service.name,id:'11111111-1111-4111-8111-111111111111',maximum:'10000',key:`0x${'11'.repeat(32)}`,quote};
  const result=await directPay(input);
  expect(result.state).toBe(mismatch?'rejected':'settled');
  expect(f.transport).toHaveBeenCalledTimes(mismatch?1:2);
  await directPay(input);expect(f.transport).toHaveBeenCalledTimes(mismatch?1:2);
 }finally{await rm(directory,{recursive:true,force:true});}
});
