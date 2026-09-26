import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NETWORK, USDC } from "@ens402/sdk";
import { prepareExternal } from "../src/external";
const mock = vi.hoisted(() => ({
  getApproval: vi.fn(), reserve: vi.fn(), finish: vi.fn(), savePrepared: vi.fn(), getExecution: vi.fn(),
  inspect: vi.fn(), screen: vi.fn(), transport: vi.fn(),
}));
vi.mock("../src/index", () => ({getStore: () => mock, inspectService: mock.inspect, screenRecipient: mock.screen, baseClient: vi.fn()}));
vi.mock("../src/transport", () => ({createResourceTransport: () => mock.transport}));
let now = 1_800_000_000;
const id = "f836490b-823a-4869-bbd0-17cf53e82efa";
const endpoint = "https://merchant.example/weather";
const payTo = `0x${"2".repeat(40)}`;
const service = () => ({ name: "weather.example.eth", endpoint, status: "active", authority: "test", block: "100", observedAt: now,
  payment: {version: 2, scheme: "exact", network: NETWORK, asset: USDC, payTo, pricing: {model:"fixed",amount:"10000",unit:"request"}}});
const approval = () => ({name:"weather.example.eth",authority:"test",endpoints:[endpoint],payTo,maxAmount:"10000",fixedPrice:"10000",expiresAt:now+600});
const challenge = () => ({x402Version:2, resource:{url:endpoint}, accepts:[{scheme:"exact",network:NETWORK,asset:USDC,payTo,amount:"10000",maxTimeoutSeconds:60,extra:{name:"USDC",version:"2"}}]});
beforeEach(() => {
  vi.resetAllMocks(); now=1_800_000_000; vi.spyOn(Date,"now").mockImplementation(()=>now*1000);
  mock.getApproval.mockResolvedValue({mode:"self",payer:`0x${"1".repeat(40)}`,approval:approval()});
  mock.reserve.mockResolvedValue({created:true}); mock.inspect.mockImplementation(async()=>service());
  mock.transport.mockImplementation(async()=>new Response(null,{status:402,headers:{"payment-required":Buffer.from(JSON.stringify(challenge())).toString("base64")}}));
  mock.screen.mockImplementation(async()=>{now+=2; return {provider:"intercepta",network:"ethereum-mainnet",address:payTo,observedAt:now,expiresAt:now+3600,cached:false,scan:{toxicScore:0,traits:[]}};});
  mock.finish.mockImplementation(async (_id,receipt)=>({id,state:receipt.state,receipt}));
  mock.getExecution.mockResolvedValue({id,state:"reserved"});
});
afterEach(()=>vi.restoreAllMocks());
it("accepts a clean scan completed after preparation starts, without signing or submitting", async()=>{
  await expect(prepareExternal({id,approvalId:id})).resolves.toMatchObject({state:"reserved"});
  expect(mock.savePrepared).toHaveBeenCalledOnce();
  expect(mock.savePrepared.mock.calls[0]![1].typedData.message.validBefore).toBe(String(now+60));
  expect(mock.finish).not.toHaveBeenCalled(); expect(mock.transport).toHaveBeenCalledTimes(1);
});
it("checks approval expiry again after a slow scan", async()=>{
  mock.getApproval.mockResolvedValue({mode:"self",payer:`0x${"1".repeat(40)}`,approval:{...approval(),expiresAt:now+61}});
  mock.screen.mockImplementation(async()=>{now+=62; return {provider:"intercepta",network:"ethereum-mainnet",address:payTo,observedAt:now,expiresAt:now+3600,cached:false,scan:{toxicScore:0,traits:[]}};});
  const result=await prepareExternal({id,approvalId:id});
  expect(result.receipt?.reason).toMatch(/expired/i); expect(mock.savePrepared).not.toHaveBeenCalled();
  expect(result.receipt?.requirement?.payTo).toBe(payTo);
});
it("retains ENS and HTTP 402 details when screening is unavailable", async()=>{
  mock.screen.mockRejectedValue(new Error("private provider details"));
  const result=await prepareExternal({id,approvalId:id});
  expect(result.receipt?.reason).toBe("Intercepta screening unavailable; no signature requested");
  expect(result.receipt?.service?.payment.payTo).toBe(payTo); expect(result.receipt?.requirement?.payTo).toBe(payTo);
  expect(JSON.stringify(result)).not.toContain("private provider details"); expect(mock.savePrepared).not.toHaveBeenCalled();
});
it("keeps real risk signals blocked and preserves their evidence", async()=>{
  mock.screen.mockResolvedValue({provider:"intercepta",network:"ethereum-mainnet",address:payTo,observedAt:now,expiresAt:now+3600,scan:{toxicScore:1,traits:[]}});
  const result=await prepareExternal({id,approvalId:id});
  expect(result.receipt?.reason).toBe("Risk signals need review"); expect(result.receipt?.evidence?.scan.toxicScore).toBe(1); expect(mock.savePrepared).not.toHaveBeenCalled();
});
it("identifies the HTTP challenge stage and preserves the resolved service", async()=>{
  mock.transport.mockResolvedValue(new Response(null,{status:503}));
  const result=await prepareExternal({id,approvalId:id});
  expect(result.receipt?.reason).toContain("HTTP 402"); expect(result.receipt?.service?.name).toBe("weather.example.eth"); expect(mock.screen).not.toHaveBeenCalled();
});
