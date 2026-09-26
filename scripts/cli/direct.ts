import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicClient, http, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { canonicalMetadata } from "../../packages/sdk/src/metadata";
import { purchaseResource, type PaymentReceipt } from "../../packages/sdk/src/http";
import { verifySettlement } from "../../packages/sdk/src/settlement";
import { validAmount, type ServiceSnapshot, type RiskEvidence, type Approval } from "../../packages/sdk/src/index";
import { createResourceTransport } from "../../packages/server/src/transport";
import { baseUrl, CliError, uuid } from "./core";
export type Quote = { service: ServiceSnapshot; evidence: RiskEvidence };
export async function directQuote(origin: string, name: string): Promise<Quote> {
  baseUrl(origin);
  const response = await fetch(`${origin}/api/checkout/quote`, { method: "POST", headers: {"Content-Type":"application/json"}, body:JSON.stringify({name}), redirect:"error", signal:AbortSignal.timeout(30_000) });
  if (!response.ok) throw new CliError(`Payment preflight unavailable (${response.status}); no payment sent`);
  const quote = await response.json() as Quote;
  if (quote.service?.name !== name || quote.service.payment?.version === 1 || quote.service.status !== "active") throw new CliError("Active fixed-price service required");
  return quote;
}
export function directApproval(service: ServiceSnapshot, maximum: string): Approval {
  if (!validAmount(maximum) || service.payment.version === 1 || !validAmount(service.payment.pricing.amount) || BigInt(service.payment.pricing.amount) > BigInt(maximum)) throw new CliError("Published price exceeds --max-price-atomic");
  return {name:service.name,authority:service.authority,endpoints:[service.endpoint],payTo:service.payment.payTo,maxAmount:service.payment.pricing.amount,fixedPrice:service.payment.pricing.amount,expiresAt:Math.floor(Date.now()/1000)+600,
    ...(service.call?.verification ? { metadataHash:canonicalMetadata(service.description ?? "",service.call).hash } : {})};
}
export function directSummary(quote: Quote, payer: string) {
  const s=quote.service;
  if(s.payment.version===1) throw new CliError("Fixed price required");
  return `${s.name}\n${formatUnits(BigInt(s.payment.pricing.amount),6)} USDC on Base Sepolia\nPay to: ${s.payment.payTo}\nSigner: ${payer}\nEndpoint: ${s.endpoint}`;
}
/** Local journal prevents a repeated id from signing again, including after a crash. */
export async function directPay(input:{origin:string;name:string;id:string;maximum:string;key:string;quote:Quote;directory?:string;rpc?:string}) {
  if(!uuid(input.id)) throw new CliError("Provide --id UUID and reuse it to read the saved result");
  const directory=input.directory ?? ".ens402/payments";
  await mkdir(directory,{recursive:true,mode:0o700});
  const path=join(directory,`${input.id}.json`);
  try {
    const saved=JSON.parse(await readFile(path,"utf8"));
    if(saved.name!==input.name || saved.origin!==input.origin) throw new CliError("Attempt id belongs to another service");
    return saved;
  } catch(e) {if((e as NodeJS.ErrnoException).code!=="ENOENT") throw e;}
  const signer=privateKeyToAccount(input.key as `0x${string}`);
  const approval=directApproval(input.quote.service,input.maximum);
  const journal={id:input.id,name:input.name,origin:input.origin,payer:signer.address,state:"started",next:"Do not pay again with a new id until this attempt is reconciled."};
  await writeFile(path,JSON.stringify(journal),{flag:"wx",mode:0o600});
  let current=input.quote;
  const client=createPublicClient({chain:baseSepolia,transport:http(input.rpc ?? "https://sepolia.base.org")});
  const receipt: PaymentReceipt=await purchaseResource({name:input.name,approval,signer,
    resolve:async()=>{current=await directQuote(input.origin,input.name);return current.service;},
    screen:async address=>{if(address.toLowerCase()!==current.evidence.address.toLowerCase())throw Error("Screening recipient changed");return current.evidence;},
    transport:createResourceTransport([new URL(input.quote.service.endpoint).origin]),
    beforeSubmit:async(authorization,requirement)=>{await writeFile(path,JSON.stringify({...journal,state:"submitting",authorization,requirement}),{mode:0o600});},
    verifySettlement:(settlement,authorization,requirement)=>verifySettlement(client,settlement,authorization,requirement),
  });
  const result={...journal,state:receipt.state,receipt,next:receipt.state === "settled" ? "Payment and delivery verified." : "Check this attempt before making another payment."};
  await writeFile(path,JSON.stringify(result),{mode:0o600});
  return result;
}

export async function directReconcile(id:string, transaction:string, rpc?:string) {
  if(!uuid(id) || !/^0x[0-9a-fA-F]{64}$/.test(transaction)) throw new CliError("Provide --id UUID and --tx transaction hash");
  const path=join('.ens402/payments',`${id}.json`);
  const saved=JSON.parse(await readFile(path,'utf8'));
  const authorization=saved.authorization ?? saved.receipt?.authorization;
  const requirement=saved.requirement ?? saved.receipt?.requirement;
  if(!authorization || !requirement) throw new CliError("No submitted authorization is recorded for this id");
  const client=createPublicClient({chain:baseSepolia,transport:http(rpc ?? 'https://sepolia.base.org')});
  await verifySettlement(client,{success:true,network:'eip155:84532',transaction,payer:authorization.from},authorization,requirement);
  const result={...saved,state:saved.state==='settled'?'settled':'paid_delivery_failed',transaction,next:'Payment verified. Do not pay again; use the saved response or contact the service for delivery.'};
  await writeFile(path,JSON.stringify(result),{mode:0o600});
  return result;
}
