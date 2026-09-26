import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createPublicClient, http, formatUnits, parseAbi, parseAbiItem, type Address, type Hex, type PublicClient, type Transport } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { PaymentRequirements } from "@x402/core/types";
import { canonicalMetadata } from "../../packages/sdk/src/metadata";
import { purchaseResource, type PaymentReceipt, type PublicAuthorization } from "../../packages/sdk/src/http";
import { verifySettlement } from "../../packages/sdk/src/settlement";
import { NETWORK, USDC, validAmount, type ServiceSnapshot, type RiskEvidence, type Approval } from "../../packages/sdk/src/index";
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
export type ChainClient = Pick<PublicClient<Transport, typeof baseSepolia>, "getBlock" | "readContract" | "getLogs" | "getChainId" | "waitForTransactionReceipt">;
export type Attempt = { id: string; name: string; origin: string; payer: string; state: string; next: string; authorization?: PublicAuthorization; requirement?: PaymentRequirements; receipt?: PaymentReceipt; previousAttempts?: { nonce: string; state: string; detail?: string }[]; transaction?: string };
const authorizationStateAbi = parseAbi(["function authorizationState(address authorizer, bytes32 nonce) view returns (bool)"]);
const authorizationUsedEvent = parseAbiItem("event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)");
/** Base Sepolia produces one block every two seconds. */
const BLOCK_SECONDS = 2n;
const chainClient = (rpc?: string): ChainClient => createPublicClient({chain:baseSepolia,transport:http(rpc ?? "https://sepolia.base.org")});

/** A settlement lands before validBefore and after signing, which the SDK bounds to 300 seconds. */
async function findAuthorizationTransaction(client: ChainClient, authorization: PublicAuthorization, latest: { number: bigint; timestamp: bigint }) {
  const validBefore = BigInt(authorization.validBefore);
  const blockAt = (time: bigint) => latest.number - (latest.timestamp - time) / BLOCK_SECONDS;
  const toBlock = [latest.number, blockAt(validBefore) + 30n].reduce((a, b) => (a < b ? a : b));
  const fromBlock = [0n, blockAt(validBefore - 600n) - 30n].reduce((a, b) => (a > b ? a : b));
  const logs = await client.getLogs({ address: USDC, event: authorizationUsedEvent, args: { authorizer: authorization.from as Address, nonce: authorization.nonce as Hex }, fromBlock, toBlock });
  return logs[0]?.transactionHash ?? undefined;
}

/** Decide an uncertain attempt from chain state alone: an unused authorization past validBefore can never move funds. */
export async function resolveAttempt(saved: Attempt, client: ChainClient, options: { wait?: boolean; sleep?: (ms: number) => Promise<void> } = {}): Promise<Attempt> {
  if (saved.state !== "submitting" && saved.state !== "uncertain") return saved;
  const authorization = saved.receipt?.authorization ?? saved.authorization;
  const requirement = saved.receipt?.requirement ?? saved.requirement;
  if (!authorization || !requirement) return saved;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
  const validBefore = BigInt(authorization.validBefore);
  for (;;) {
    const block = await client.getBlock();
    // Read at the same block whose timestamp decides expiry.
    const used = await client.readContract({ address: USDC, abi: authorizationStateAbi, functionName: "authorizationState", args: [authorization.from as Address, authorization.nonce as Hex], blockNumber: block.number });
    if (used) {
      const transaction = await findAuthorizationTransaction(client, authorization, block);
      try {
        if (!transaction) throw new Error("Transaction not found");
        await verifySettlement(client, { success: true, network: NETWORK, transaction, payer: authorization.from }, authorization, requirement);
      } catch {
        return { ...saved, state: "uncertain", next: "The authorization was used onchain, but no matching settlement transaction was verified. Check the payer's USDC transfers before paying again." };
      }
      return { ...saved, state: "paid_delivery_failed", transaction, next: "Payment settled onchain, but this CLI did not receive the resource. Do not pay again; share the transaction with the provider." };
    }
    // USDC rejects an authorization once block time reaches validBefore.
    if (block.timestamp >= validBefore) return { ...saved, state: "not_paid", next: "The authorization expired unused onchain, so no funds moved. It is safe to pay again with a new id." };
    if (!options.wait) return { ...saved, state: "uncertain", next: `The authorization can still settle until ${new Date(Number(validBefore) * 1000).toISOString()}. Check status again after that time.` };
    await sleep(Math.min(5000, Math.max(1000, Number(validBefore - block.timestamp) * 1000)));
  }
}

/** Refresh a saved attempt from chain state without waiting or signing. */
export async function directStatus(id: string, rpc?: string, directory = ".ens402/payments", client: ChainClient = chainClient(rpc)) {
  if (!uuid(id)) throw new CliError("Provide --id UUID");
  const path = join(directory, `${id}.json`);
  const saved = JSON.parse(await readFile(path, "utf8")) as Attempt;
  const result = await resolveAttempt(saved, client);
  if (result.state !== saved.state || result.next !== saved.next) await writeFile(path, JSON.stringify(result), { mode: 0o600 });
  return result;
}

/** Local journal prevents a repeated id from signing again, including after a crash. */
export async function directPay(input:{origin:string;name:string;id:string;maximum:string;key:string;quote:Quote;directory?:string;rpc?:string;client?:ChainClient;retries?:number;sleep?:(ms:number)=>Promise<void>;log?:(message:string)=>void}) {
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
  const client=input.client ?? chainClient(input.rpc);
  const previousAttempts: NonNullable<Attempt["previousAttempts"]>=[];
  for (;;) {
    const receipt: PaymentReceipt=await purchaseResource({name:input.name,approval,signer,
      resolve:async()=>{current=await directQuote(input.origin,input.name);return current.service;},
      screen:async address=>{if(address.toLowerCase()!==current.evidence.address.toLowerCase())throw Error("Screening recipient changed");return current.evidence;},
      transport:createResourceTransport([new URL(input.quote.service.endpoint).origin]),
      beforeSubmit:async(authorization,requirement)=>{await writeFile(path,JSON.stringify({...journal,previousAttempts,state:"submitting",authorization,requirement}),{mode:0o600});},
      verifySettlement:(settlement,authorization,requirement)=>verifySettlement(client,settlement,authorization,requirement),
    });
    let result: Attempt={...journal,previousAttempts,state:receipt.state,receipt,next:receipt.state === "settled" ? "Payment and delivery verified." : "Check this attempt before making another payment."};
    if (receipt.state === "uncertain") {
      await writeFile(path,JSON.stringify(result),{mode:0o600});
      input.log?.("Settlement is uncertain. Checking the authorization onchain until it settles or expires (up to about a minute).");
      result=await resolveAttempt(result,client,{wait:true,sleep:input.sleep});
    }
    await writeFile(path,JSON.stringify(result),{mode:0o600});
    // Retry only after chain state proves the previous authorization can never transfer.
    if (result.state !== "not_paid" || previousAttempts.length >= (input.retries ?? 1)) return result;
    previousAttempts.push({nonce:receipt.authorization!.nonce,state:"not_paid",detail:receipt.steps.at(-1)?.detail});
    input.log?.("The previous authorization expired unused, so no funds moved. Retrying once with a new authorization.");
  }
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
