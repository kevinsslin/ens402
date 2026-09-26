import { expect, it } from "vitest";
import { keccak256, stringToHex, type Address, type PublicClient } from "viem";
import { sharedResolverPlan } from "../../../scripts/ens/provider-shared";
import { currentDeployment } from "../../../packages/sdk/src/ens/current";
const admin = `0x${"1".repeat(40)}` as Address;
const delegate = `0x${"2".repeat(40)}` as Address;
const resolver = `0x${"3".repeat(40)}` as Address;
function client(existingKeys: string[] = []) {
  return { getCode: async()=>"0x01", readContract: async({functionName,args}: {functionName:string;args:unknown[]})=>{
    if(functionName === "verifyContract") return currentDeployment.resolverImplementation;
    if(functionName === "hasRootRoles") return String(args[1]).toLowerCase() === admin.toLowerCase();
    return args[1] === 16n && existingKeys.some(key=>BigInt(keccak256(stringToHex(key))) === args[0]);
  }} as unknown as PublicClient;
}
it("allows Admin, Ops and Treasury to be the same wallet without redundant grants",async()=>{
  const plan=await sharedResolverPlan(client(),admin,admin,admin,"demo.ens402.eth",1n,1n,resolver);
  expect(plan.transactions).toEqual([]);
});
it("merges Ops and Treasury keys for a shared delegate and accepts their existing union",async()=>{
  const plan=await sharedResolverPlan(client(),admin,delegate,delegate,"demo.ens402.eth",1n,1n,resolver);
  expect(plan.transactions).toHaveLength(5);
  const ready=await sharedResolverPlan(client(["agent-endpoint[x402]","description","avatar","ens402.call","ens402.payment"]),admin,delegate,delegate,"demo.ens402.eth",1n,1n,resolver);
  expect(ready.transactions).toEqual([]);
});
it("allows Admin to act as Ops or Treasury without expanding the other delegate",async()=>{
  expect((await sharedResolverPlan(client(),admin,admin,delegate,"demo.ens402.eth",1n,1n,resolver)).transactions).toHaveLength(1);
  expect((await sharedResolverPlan(client(),admin,delegate,admin,"demo.ens402.eth",1n,1n,resolver)).transactions).toHaveLength(4);
});
