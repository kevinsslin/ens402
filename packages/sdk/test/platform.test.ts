import {it,expect,vi} from 'vitest';
import {ENS402Client} from '../src/platform';
import {NETWORK,USDC,type Approval} from '../src/index';
import {authorizationTypes} from '@x402/evm';
const payer='0x1111111111111111111111111111111111111111',payTo='0x2222222222222222222222222222222222222222';
const now=Math.floor(Date.now()/1000);
const approval:Approval={name:'weather.example.eth',authority:'test',endpoints:['https://weather.example/api'],payTo,maxAmount:'100',expiresAt:now+1000};
const prepared=()=>({state:'reserved',id:'attempt',approval_id:'approval',prepared:{typedData:{domain:{name:'USDC',version:'2',chainId:84532,verifyingContract:USDC},types:authorizationTypes,primaryType:'TransferWithAuthorization',message:{from:payer,to:payTo,value:'10',validAfter:'0',validBefore:String(now+60),nonce:`0x${'01'.repeat(32)}`}},receipt:{state:'held',reason:'ready',steps:[],service:{name:approval.name,authority:'test',endpoint:approval.endpoints[0],status:'active',block:'1',observedAt:now,payment:{version:1,scheme:'exact',network:NETWORK,asset:USDC,payTo}},requirement:{scheme:'exact',network:NETWORK,asset:USDC,payTo,amount:'10',maxTimeoutSeconds:60,extra:{name:'USDC',version:'2'}},evidence:{provider:'intercepta',network:'ethereum-mainnet',address:payTo,observedAt:now,expiresAt:now+300,cached:false,scan:{toxicScore:0,traits:[]}}}}});
it('does not retry payment requests after a lost response or leak a key in the error',async()=>{
 const fetcher=vi.fn(async()=>{throw new Error('provider secret detail');});
 const client=new ENS402Client({baseUrl:'https://ens402.example',apiKey:'secret-key',fetch:fetcher});
 await expect(client.purchase({id:'persisted',approvalId:'approved'})).rejects.toThrow('same execution ID');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('refuses insecure remote deployments and URL credentials',()=>{
 expect(()=>new ENS402Client({baseUrl:'http://remote.example',apiKey:'key'})).toThrow('HTTPS');
 expect(()=>new ENS402Client({baseUrl:'https://key:secret@remote.example',apiKey:'key'})).toThrow('credentials');
});
it('uses the local signer then submits only the signature for the existing attempt',async()=>{
 const fetcher=vi.fn(async(_url:unknown,init?:RequestInit)=>JSON.parse(String(init?.body)).action==='prepare-external'?Response.json(prepared()):Response.json({state:'settled',id:'attempt'}));
 const signTypedData=vi.fn(async()=>`0x${'01'.repeat(65)}` as `0x${string}`);
 const client=new ENS402Client({baseUrl:'https://ens402.example',apiKey:'key',fetch:fetcher});
 expect(await client.purchaseWithSigner({id:'attempt',approvalId:'approval',approval,signer:{address:payer,signTypedData}})).toMatchObject({state:'settled'});
 expect(signTypedData).toHaveBeenCalledTimes(1);expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toMatchObject({action:'submit-external',id:'attempt'});
});
it('rejects a server-prepared signature that changes the chain or payment amount before signing',async()=>{
 for(const field of ['chain','amount']){
  const p=prepared();if(field==='chain')p.prepared.typedData.domain.chainId=1;else p.prepared.typedData.message.value='99';
  const signTypedData=vi.fn(async()=> '0x00' as `0x${string}`);
  const client=new ENS402Client({baseUrl:'https://ens402.example',apiKey:'key',fetch:async()=>Response.json(p)});
  await expect(client.purchaseWithSigner({id:'attempt',approvalId:'approval',approval,signer:{address:payer,signTypedData}})).rejects.toThrow('outside local scope');expect(signTypedData).not.toHaveBeenCalled();
 }
});
