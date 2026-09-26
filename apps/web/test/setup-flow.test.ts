import { afterEach, expect, it, vi } from "vitest";
import { confirmSetup, setupError } from "../src/components/setup-flow";
import { prepareSetupStep, setupReceipt } from "../src/server/setup-transaction";
import { createEnsClient } from "../../../packages/server/src/ens-rpc";
import { sharedResolverPlan } from "../../../scripts/ens/provider-shared";
import { currentDeployment } from "@ens402/sdk/ens";
import { BlockNotFoundError, TransactionNotFoundError, TransactionReceiptNotFoundError } from "viem";
const hash = `0x${"ab".repeat(32)}`;
const owner="0x1111111111111111111111111111111111111111", ops="0x2222222222222222222222222222222222222222", treasury="0x3333333333333333333333333333333333333333";
const step={signer:owner, to:ops,data:"0x1234",description:"Create provider registry"};
afterEach(()=>vi.unstubAllGlobals());
it("prepares gas on the server without using a wallet transport",async()=>{
 const estimateGas=vi.fn().mockResolvedValue(100n);
 expect((await prepareSetupStep(step,{estimateGas} as never)).gas).toBe("120");
 expect(estimateGas).toHaveBeenCalledWith(expect.objectContaining({account:owner,to:ops,data:"0x1234"}));
});
it("tracks a submitted hash through pending to confirmation without resubmitting",async()=>{
 const request=vi.fn().mockResolvedValueOnce(Response.json({status:"pending"})).mockResolvedValueOnce(Response.json({status:"success",hash,from:owner,to:ops,data:"0x1234",value:"0"}));
 const delay=vi.fn().mockResolvedValue(undefined);
 expect((await confirmSetup({hash,step},{fetch:request,delay})).status).toBe("success");
 expect(request).toHaveBeenCalledTimes(2);expect(delay).toHaveBeenCalledWith(5000);
 expect(request.mock.calls.every(([url])=>String(url).includes('/receipt?hash='))).toBe(true);
});
it("keeps unknown confirmation separate from a reverted transaction",async()=>{
 await expect(confirmSetup({hash,step},{attempts:2,delay:async()=>{},fetch:async()=>new Response('',{status:503})})).rejects.toThrow("transaction is saved");
 await expect(confirmSetup({hash,step},{attempts:1,fetch:async()=>Response.json({status:"pending"})})).rejects.toThrow("without signing again");
 await expect(confirmSetup({hash,step},{fetch:async()=>Response.json({status:"reverted",hash,from:owner,to:ops,data:"0x1234",value:"0"})})).resolves.toMatchObject({status:"reverted"});
});
it("rejects a receipt for a different payload",async()=>{
 await expect(confirmSetup({hash,step},{fetch:async()=>Response.json({status:"success",hash,from:owner,to:ops,data:"0xffff",value:"0"})})).rejects.toThrow("does not match");
});
it("reports missing receipt as pending but preserves RPC failures",async()=>{
 const client={getTransactionReceipt:vi.fn().mockRejectedValue(new TransactionReceiptNotFoundError({hash:hash as `0x${string}`}))};
 await expect(setupReceipt(hash,client as never)).resolves.toEqual({status:"pending"});
 client.getTransactionReceipt.mockRejectedValue(new Error("429"));await expect(setupReceipt(hash,client as never)).rejects.toThrow("429");
});
it("hides wallet calldata and explains Tenderly throttling",()=>{
 expect(setupError(new Error('[From https://gateway.tenderly.co] rate limit exceeded'))).toContain('check its activity');
 expect(setupError(new Error('Request body: private calldata https://rpc/key'))).not.toContain('private calldata');
});
it("fails over rate-limited reads to an independent RPC",async()=>{
 const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url,init)=>{
  calls.push(String(url));
  if(String(url).includes('primary'))return new Response('busy',{status:429});
  const request=JSON.parse(init.body);
  const result=(item:{id:number})=>({jsonrpc:'2.0',id:item.id,result:'0xaa36a7'});
  return Response.json(Array.isArray(request)?request.map(result):result(request));
 }));
 const client=createEnsClient('https://primary.test','https://backup.test');
 expect(await client.getChainId()).toBe(11155111);
 expect(calls.some(url=>url.includes('backup'))).toBe(true);
});
it("accepts an EOA as Treasury Admin without querying its code",async()=>{
 const client={getCode:vi.fn(),simulateContract:vi.fn().mockResolvedValue({result:ops})};
 const result=await sharedResolverPlan(client as never,owner,ops,treasury,'demo.ens402.eth',1n,100n);
 expect(result.transactions).toHaveLength(1);
 expect(client.getCode).not.toHaveBeenCalled();
 expect(result.transactions[0]?.to).toBe(currentDeployment.factory);
});
it("does not advance a deployment without its contract address",async()=>{
 const creation={...step,to:undefined};
 await expect(confirmSetup({hash,step:creation},{fetch:async()=>Response.json({status:"success",hash,from:owner,to:null,data:"0x1234",value:"0",contractAddress:null})})).rejects.toThrow("missing its contract address");
});

it("automatically retries temporary receipt failures without another wallet request", async () => {
 const request = vi.fn()
  .mockRejectedValueOnce(new TypeError("Failed to fetch"))
  .mockResolvedValueOnce(new Response(null, {status:503}))
  .mockResolvedValueOnce(new Response(null, {status:429}))
  .mockResolvedValueOnce(Response.json({status:"success",hash,from:owner,to:ops,data:"0x1234",value:"0"}));
 const delay=vi.fn().mockResolvedValue(undefined);
 await expect(confirmSetup({hash,step},{fetch:request,delay})).resolves.toMatchObject({status:"success"});
 expect(request).toHaveBeenCalledTimes(4);
 expect(delay).toHaveBeenCalledTimes(3);
 expect(request.mock.calls.every(([url])=>String(url).includes('/receipt?hash='))).toBe(true);
});
it("does not retry invalid requests or receipt mismatches", async () => {
 const request=vi.fn().mockResolvedValue(new Response(null,{status:400}));
 await expect(confirmSetup({hash,step},{fetch:request})).rejects.toThrow("Could not check");
 expect(request).toHaveBeenCalledTimes(1);
});
it("waits when transaction or block reads lag behind a mined receipt", async () => {
 const client={
  getTransactionReceipt:vi.fn().mockResolvedValue({blockNumber:100n,blockHash:hash}),
  getTransaction:vi.fn().mockRejectedValue(new TransactionNotFoundError({hash:hash as `0x${string}`})),
  getBlock:vi.fn().mockResolvedValue({hash}),
 };
 await expect(setupReceipt(hash,client as never)).resolves.toEqual({status:"pending"});
 client.getTransaction.mockResolvedValue({blockHash:hash});
 client.getBlock.mockRejectedValue(new BlockNotFoundError({blockNumber:100n}));
 await expect(setupReceipt(hash,client as never)).resolves.toEqual({status:"pending"});
});

it("recognizes pending receipts across separate viem module instances", async () => {
 for (const name of ["TransactionReceiptNotFoundError", "TransactionNotFoundError", "BlockNotFoundError"]) {
  const foreignError=Object.assign(new Error("Not yet available"),{name});
  expect(foreignError instanceof TransactionReceiptNotFoundError).toBe(false);
  await expect(setupReceipt(hash,{getTransactionReceipt:async()=>{throw foreignError;}} as never)).resolves.toEqual({status:"pending"});
 }
});
it("handles a real RPC null receipt through the workspace client", async () => {
 vi.stubGlobal("fetch",vi.fn(async(_url,init)=>{
  const payload=JSON.parse(init.body);
  const result=(item:{id:number})=>({jsonrpc:"2.0",id:item.id,result:null});
  return Response.json(Array.isArray(payload)?payload.map(result):result(payload));
 }));
 const client=createEnsClient("http://127.0.0.1:18549");
 await expect(setupReceipt(hash,client)).resolves.toEqual({status:"pending"});
});
