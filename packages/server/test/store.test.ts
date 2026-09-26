import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/store';
import { NETWORK, USDC } from '@ens402/sdk';
import type { ResolvedService } from '@ens402/sdk/ens';
const exec = promisify(execFile);
let directory:string, store:Store, other:Store;
let started=false;
beforeAll(async()=>{
  directory=await mkdtemp(join(tmpdir(),'ens402-pg-test-'));
  const socket=createServer();await new Promise<void>(r=>socket.listen(0,'127.0.0.1',r));const port=(socket.address() as {port:number}).port;await new Promise<void>(r=>socket.close(()=>r()));
  await exec('initdb',['-D',join(directory,'data'),'-U','ens402_test','-A','trust','--no-locale']);
  await exec('pg_ctl',['-D',join(directory,'data'),'-l',join(directory,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${directory}`,'-w','start']);started=true;
  const url=`postgresql://ens402_test@127.0.0.1:${port}/postgres`;
  store=new Store(url);other=new Store(url);await store.migrate();
},60000);
afterAll(async()=>{await store?.close();await other?.close();if(started)await exec('pg_ctl',['-D',join(directory,'data'),'-m','fast','-w','stop']);if(directory)await rm(directory,{recursive:true,force:true});});
async function approval(dailyLimit='10000'){
  const id=randomUUID(),payTo='0x2222222222222222222222222222222222222222';
  const service:ResolvedService={name:'search.example.eth',endpoint:'https://merchant.example/search',status:'active',authority:'fixture',block:'123',observedAt:Math.floor(Date.now()/1000),payment:{version:1,scheme:'exact',network:NETWORK,asset:USDC,payTo},resolver:payTo,implementation:payTo,owner:payTo,parentRegistry:payTo,blockHash:`0x${'00'.repeat(32)}`,recordVersion:'0',authorityCoverage:[]};
  await store.createApproval({id,fingerprint:id,service,dailyLimit,approval:{name:service.name,authority:service.authority,endpoints:[service.endpoint],payTo,maxAmount:'6000',expiresAt:Math.floor(Date.now()/1000)+600}});
  await store.activate(id,'wallet-id',payTo,'policy-id');return id;
}
const authorization={from:'0x1111111111111111111111111111111111111111',to:'0x2222222222222222222222222222222222222222',value:'5000',validAfter:'0',validBefore:String(Math.floor(Date.now()/1000)+300),nonce:`0x${'11'.repeat(32)}`};
const requirement={scheme:'exact',network:NETWORK,asset:USDC,payTo:authorization.to,amount:'5000',maxTimeoutSeconds:60,extra:{name:'USDC',version:'2'}};
describe('real PostgreSQL execution ledger',()=>{
  it('serializes concurrent budget reservations across server connections',async()=>{
    const id=await approval();const attempts=await Promise.allSettled([store.reserve(randomUUID(),id,Math.floor(Date.now()/1000)),other.reserve(randomUUID(),id,Math.floor(Date.now()/1000))]);
    expect(attempts.filter(x=>x.status==='fulfilled')).toHaveLength(1);expect(attempts.filter(x=>x.status==='rejected')).toHaveLength(1);
  });
  it('returns the original attempt on replay rather than reserving again',async()=>{
    const approvalId=await approval(),id=randomUUID();const first=await store.reserve(id,approvalId,Math.floor(Date.now()/1000));const replay=await other.reserve(id,approvalId,Math.floor(Date.now()/1000));expect(first.created).toBe(true);expect(replay.created).toBe(false);expect(replay.execution.id).toBe(id);
  });
  it('releases pre-submission holds but retains uncertain payments in the budget',async()=>{
    const approvalId=await approval(),id=randomUUID();await store.reserve(id,approvalId,Math.floor(Date.now()/1000));await store.finish(id,{state:'held',reason:'Risk unavailable',steps:[]});
    const next=randomUUID();await store.reserve(next,approvalId,Math.floor(Date.now()/1000));await store.beforeSubmit(next,authorization,requirement);await store.finish(next,{state:'uncertain',reason:'Network timeout after send',steps:[]});
    await expect(other.reserve(randomUUID(),approvalId,Math.floor(Date.now()/1000))).rejects.toThrow('Daily budget');
    expect((await store.getExecution(next)).reserved_amount).toBe('5000');
  });
  it('persists the nonce before submission and refuses duplicate submission',async()=>{
    const approvalId=await approval(),id=randomUUID();await store.reserve(id,approvalId,Math.floor(Date.now()/1000));await store.beforeSubmit(id,authorization,requirement);
    expect((await other.getExecution(id)).authorization?.nonce).toBe(authorization.nonce);
    await expect(other.beforeSubmit(id,authorization,requirement)).rejects.toThrow('cannot submit again');
  });
  it('blocks an in-flight reservation after buyer revocation',async()=>{
    const approvalId=await approval(),id=randomUUID();await store.reserve(id,approvalId,Math.floor(Date.now()/1000));await store.revoke(approvalId);await expect(store.beforeSubmit(id,authorization,requirement)).rejects.toThrow('revoked');
  });
  it('cancels unsent reservations and prevents a late worker from submitting',async()=>{const approvalId=await approval(),id=randomUUID();await store.reserve(id,approvalId,Math.floor(Date.now()/1000));await other.cancelReserved(id);await expect(store.beforeSubmit(id,authorization,requirement)).rejects.toThrow('cannot submit again');});
  it('releases only reservations that can no longer submit',async()=>{
    const approvalId=await approval('100000'),now=Math.floor(Date.now()/1000);
    const expired=randomUUID(),live=randomUUID(),unprepared=randomUUID(),submitted=randomUUID();
    for(const id of [expired,live,unprepared,submitted])await store.reserve(id,approvalId,now);
    await store.savePrepared(expired,{typedData:{message:{validBefore:String(now-1)}}});
    await store.savePrepared(live,{typedData:{message:{validBefore:String(now+60)}}});
    await store.beforeSubmit(submitted,authorization,requirement);
    await other.releaseStaleReservations('operator',now);
    expect((await store.getExecution(expired)).state).toBe('held');
    expect((await store.getExecution(live)).state).toBe('reserved');
    expect((await store.getExecution(unprepared)).state).toBe('reserved');
    await expect(store.beforeSubmit(expired,authorization,requirement)).rejects.toThrow('cannot submit again');
    await other.releaseStaleReservations('someone-else',now+301);
    expect((await store.getExecution(unprepared)).state).toBe('reserved');
    await other.releaseStaleReservations('operator',now+301);
    expect((await store.getExecution(unprepared)).state).toBe('held');
    expect((await store.getExecution(submitted)).state).toBe('submitting');
  });
  it('cannot cancel a submitted authorization',async()=>{const approvalId=await approval(),id=randomUUID();await store.reserve(id,approvalId,Math.floor(Date.now()/1000));await store.beforeSubmit(id,authorization,requirement);await expect(other.cancelReserved(id)).rejects.toThrow('already be submitted');});
  it('isolates idempotency keys between approvals',async()=>{
    const one=await approval(),two=await approval(),id=randomUUID();await store.reserve(id,one,Math.floor(Date.now()/1000));await expect(other.reserve(id,two,Math.floor(Date.now()/1000))).rejects.toThrow('another approval');
  });
  it('allows one merchant settlement claimant and replays its saved result',async()=>{
    const key=randomUUID();const claims=await Promise.all([store.claimMerchant(key),other.claimMerchant(key)]);expect(claims.filter(x=>x.claimed)).toHaveLength(1);
    await store.finishMerchant(key,{status:200,body:{demo:true},headers:{}});expect((await other.merchantResponse(key)).response.body.demo).toBe(true);expect((await store.claimMerchant(key)).claimed).toBe(false);
  });
  it('never releases budget after submission, even on a late hold',async()=>{const approvalId=await approval(),id=randomUUID();await store.reserve(id,approvalId,Math.floor(Date.now()/1000));await store.beforeSubmit(id,authorization,requirement);await expect(store.finish(id,{state:'held',reason:'late failure',steps:[]})).rejects.toThrow('unsafe');expect((await store.getExecution(id)).state).toBe('submitting');await expect(other.reserve(randomUUID(),approvalId,Math.floor(Date.now()/1000))).rejects.toThrow('Daily budget');});
  it('does not overwrite final payment outcomes',async()=>{
    const approvalId=await approval(),id=randomUUID();await store.reserve(id,approvalId,Math.floor(Date.now()/1000));await store.beforeSubmit(id,authorization,requirement);await store.finish(id,{state:'settled',reason:'confirmed',steps:[]});await expect(store.finish(id,{state:'held',reason:'late error',steps:[]})).rejects.toThrow('already final');
  });
});
