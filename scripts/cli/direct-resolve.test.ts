import {it,expect,vi,afterEach} from 'vitest';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {encodePaymentRequiredHeader,encodePaymentResponseHeader} from '@x402/core/http';
import {NETWORK,USDC} from '../../packages/sdk/src/index';
const f=vi.hoisted(()=>({transport:vi.fn(),verify:vi.fn()}));
vi.mock('../../packages/server/src/transport',()=>({createResourceTransport:()=>f.transport}));
vi.mock('../../packages/sdk/src/settlement',()=>({verifySettlement:f.verify}));
import {directPay,directStatus,resolveAttempt,type Attempt,type ChainClient,type Quote} from './direct';
afterEach(()=>{vi.unstubAllGlobals();vi.resetAllMocks();});
const validBefore=1_800_000_060n;
const payTo=`0x${'2'.repeat(40)}`;
const requirement={scheme:'exact',network:NETWORK,asset:USDC,payTo,amount:'10000',maxTimeoutSeconds:60,extra:{name:'USDC',version:'2'}};
const authorization={from:`0x${'1'.repeat(40)}`,to:payTo,value:'10000',validAfter:'0',validBefore:String(validBefore),nonce:`0x${'ab'.repeat(32)}`};
const uncertain={id:'11111111-1111-4111-8111-111111111111',name:'hello.demo.ens402.eth',origin:'https://example.com',payer:authorization.from,state:'uncertain',next:'Check this attempt before making another payment.',receipt:{state:'uncertain',reason:'Submission outcome is uncertain; reconcile before retrying',steps:[],authorization,requirement}} as Attempt;
function chain(blocks:{timestamp:bigint;used:boolean}[],logs:unknown[]=[]){
 let index=0;
 const client={
  getBlock:vi.fn(async()=>{const b=blocks[Math.min(index,blocks.length-1)]!;return {number:1000n+BigInt(index),timestamp:b.timestamp};}),
  readContract:vi.fn(async()=>blocks[Math.min(index++,blocks.length-1)]!.used),
  getLogs:vi.fn(async()=>logs),getChainId:vi.fn(),waitForTransactionReceipt:vi.fn(),
 };
 return client as typeof client & ChainClient;
}
it('proves an expired unused authorization moved no funds',async()=>{
 const client=chain([{timestamp:validBefore,used:false}]);
 await expect(resolveAttempt(uncertain,client)).resolves.toMatchObject({state:'not_paid',next:expect.stringContaining('no funds moved')});
 expect(client.readContract).toHaveBeenCalledWith(expect.objectContaining({functionName:'authorizationState',blockNumber:1000n}));
});
it('reports a still-valid authorization as uncertain without waiting',async()=>{
 await expect(resolveAttempt(uncertain,chain([{timestamp:validBefore-5n,used:false}]))).resolves.toMatchObject({state:'uncertain',next:expect.stringContaining('Check status again')});
});
it('waits for expiry before deciding when asked to',async()=>{
 const sleep=vi.fn(async()=>{});
 await expect(resolveAttempt(uncertain,chain([{timestamp:validBefore-5n,used:false},{timestamp:validBefore+1n,used:false}]),{wait:true,sleep})).resolves.toMatchObject({state:'not_paid'});
 expect(sleep).toHaveBeenCalledOnce();
});
it('finds and verifies a settlement the CLI never saw',async()=>{
 const transaction=`0x${'cd'.repeat(32)}`;const client=chain([{timestamp:validBefore+30n,used:true}],[{transactionHash:transaction}]);f.verify.mockResolvedValue(undefined);
 await expect(resolveAttempt(uncertain,client)).resolves.toMatchObject({state:'paid_delivery_failed',transaction});
 const range=(client.getLogs.mock.calls as unknown as [{fromBlock:bigint;toBlock:bigint}][])[0]![0];expect(range.toBlock-range.fromBlock).toBeLessThan(1000n);
 expect(f.verify).toHaveBeenCalledWith(client,expect.objectContaining({transaction}),authorization,requirement);
});
it('never calls a used authorization unpaid when its transaction cannot be verified',async()=>{
 await expect(resolveAttempt(uncertain,chain([{timestamp:validBefore+30n,used:true}]))).resolves.toMatchObject({state:'uncertain'});
});
it('updates the saved journal on status',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ens402-status-'));
 try{
  await writeFile(join(directory,`${uncertain.id}.json`),JSON.stringify(uncertain));
  await expect(directStatus(uncertain.id,undefined,directory,chain([{timestamp:validBefore,used:false}]))).resolves.toMatchObject({state:'not_paid'});
  expect(JSON.parse(await readFile(join(directory,`${uncertain.id}.json`),'utf8')).state).toBe('not_paid');
 }finally{await rm(directory,{recursive:true,force:true});}
});
it('retries once after a failed settlement is proven unpaid onchain',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'ens402-retry-'));const now=Math.floor(Date.now()/1000);
 const quote={service:{name:'hello.demo.ens402.eth',endpoint:'https://example.com/hello',status:'active',authority:'test-chain',block:'1',observedAt:now,payment:{version:2,scheme:'exact',network:NETWORK,asset:USDC,payTo,pricing:{model:'fixed',amount:'10000',unit:'request'}}},evidence:{provider:'intercepta',network:'ethereum-mainnet',address:payTo,observedAt:now,expiresAt:now+1000,cached:false,scan:{toxicScore:0,traits:[]}}} as Quote;
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json(quote)));
 const challenge=()=>new Response(null,{status:402,headers:{'PAYMENT-REQUIRED':encodePaymentRequiredHeader({x402Version:2,resource:{url:quote.service.endpoint},accepts:[requirement]})}});
 const failed=encodePaymentResponseHeader({success:false,errorReason:'invalid_exact_evm_transaction_failed',transaction:'',network:NETWORK});
 f.transport.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(new Response('{}',{status:402,headers:{'PAYMENT-RESPONSE':failed}})).mockResolvedValueOnce(challenge())
  .mockImplementationOnce(async()=>new Response('{"message":"Hello, world!"}',{headers:{'PAYMENT-RESPONSE':encodePaymentResponseHeader({success:true,network:NETWORK,transaction:`0x${'ab'.repeat(32)}`,payer:'0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A'})}}));
 f.verify.mockResolvedValue(undefined);
 const log=vi.fn();
 try{
  const result=await directPay({directory,origin:'https://example.com',name:quote.service.name,id:uncertain.id,maximum:'10000',key:`0x${'11'.repeat(32)}`,quote,client:chain([{timestamp:BigInt(now+10_000),used:false}]),sleep:async()=>{},log});
  expect(result.state).toBe('settled');expect(result.previousAttempts).toEqual([expect.objectContaining({state:'not_paid',detail:'Merchant reported a failed settlement: invalid_exact_evm_transaction_failed'})]);
  expect(f.transport).toHaveBeenCalledTimes(4);expect(log).toHaveBeenCalledWith(expect.stringContaining('Retrying once'));
  expect(JSON.parse(await readFile(join(directory,`${uncertain.id}.json`),'utf8')).state).toBe('settled');
 }finally{await rm(directory,{recursive:true,force:true});}
});
