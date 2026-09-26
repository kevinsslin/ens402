import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { privateKeyToAccount } from "viem/accounts";
import { formatUnits } from "viem";
import { ENS402Client, type PlatformExecution } from "../../packages/sdk/src/platform";
import { validAmount, type Approval } from "../../packages/sdk/src/index";
import { validateResourceRequest, type ResourceRequest } from "../../packages/sdk/src/request";

export class CliError extends Error {}
export type PaymentConfig = { version: 1; baseUrl: string; apiKey: string; approvalId: string; mode: "hosted" | "self"; payer: string; approval: Approval };
export function baseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new CliError("Invalid API origin"); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new CliError("Use an HTTPS API origin without credentials or paths");
  return url.origin;
}
export function parsePaymentConfig(value: unknown): PaymentConfig {
  const v = value as PaymentConfig;
  if (!v || v.version !== 1 || !["hosted", "self"].includes(v.mode) || typeof v.apiKey !== "string" || !/^ens402_[A-Za-z0-9_-]{43}$/.test(v.apiKey) || !uuid(v.approvalId) || (typeof v.payer !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(v.payer))) throw new CliError("Invalid CLI checkout file; export a new one from Console");
  baseUrl(v.baseUrl);
  const a = v.approval;
  if (!a || typeof a.name !== "string" || !a.name.endsWith(".eth") || typeof a.authority !== "string" || !a.authority || !Array.isArray(a.endpoints) || a.endpoints.length !== 1 || typeof a.endpoints[0] !== "string" || !/^https:\/\//.test(a.endpoints[0]!) || !/^0x[0-9a-fA-F]{40}$/.test(a.payTo) || (!validAmount(a.maxAmount) || a.maxAmount === "0") || a.fixedPrice !== a.maxAmount || !Number.isSafeInteger(a.expiresAt)) throw new CliError("Invalid fixed-price approval in checkout file");
  return v;
}
export const uuid = (value: string) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export async function loadConfig(path: string) {
  try { const text = await readFile(path, "utf8"); if (text.length > 16384) throw new Error(); return parsePaymentConfig(JSON.parse(text)); }
  catch { throw new CliError("Cannot read CLI checkout file; export an active checkout from Console"); }
}
export function paymentSummary(config: PaymentConfig) {
  return `${config.approval.name}\n${formatUnits(BigInt(config.approval.maxAmount), 6)} USDC on Base Sepolia\nPay to: ${config.approval.payTo}\nSigner: ${config.payer} (${config.mode})\nAPI: ${config.baseUrl}`;
}
export function compactExecution(result: PlatformExecution) {
  const receipt = result.receipt;
  return { id: result.id, state: result.state, paymentState: receipt?.state, reason: receipt?.reason, transaction: receipt?.settlement?.transaction,
    ...(receipt?.state === "settled" ? { resource: receipt.resource } : {}),
    ...(receipt?.state === "uncertain" || result.state === "submitting" ? { next: "Check status with this same id. Do not start another payment." } : {}) };
}
/** Persist the attempt before signing or transmission. A reused id only checks status. */
export async function executePayment(input: { config: PaymentConfig; configPath: string; id: string; confirmed: boolean; request?: ResourceRequest; privateKey?: string }, client = new ENS402Client({ baseUrl: input.config.baseUrl, apiKey: input.config.apiKey })) {
  const { config, id } = input;
  if (!uuid(id)) throw new CliError("Provide a UUID with --id and reuse it when checking this payment");
  if (!input.confirmed) throw new CliError("Payment not confirmed; use an interactive terminal or --yes after user approval");
  const request = input.request ? validateResourceRequest(input.request) : undefined;
  const directory = join(dirname(input.configPath), "ens402-attempts");
  const path = join(directory, `${id}.json`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const saved = JSON.parse(await readFile(path, "utf8"));
    if (saved.approvalId !== config.approvalId || saved.baseUrl !== config.baseUrl || JSON.stringify(saved.request) !== JSON.stringify(request)) throw new CliError("Attempt id belongs to a different request");
    return client.execution(id);
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  if (config.approval.expiresAt <= Date.now() / 1000) throw new CliError("Checkout expired; create and export a new checkout in Console");
  let signer;
  if (config.mode === "self") {
    if (!/^0x[0-9a-fA-F]{64}$/.test(input.privateKey ?? "")) throw new CliError("Self signing needs ENS402_PRIVATE_KEY in the local process environment");
    signer = privateKeyToAccount(input.privateKey as `0x${string}`);
    if (signer.address.toLowerCase() !== config.payer.toLowerCase()) throw new CliError("Local wallet does not match the approved payer");
  }
  await writeFile(path, JSON.stringify({ id, approvalId: config.approvalId, baseUrl: config.baseUrl, request }), { flag: "wx", mode: 0o600 });
  return signer
    ? client.purchaseWithSigner({ id, approvalId: config.approvalId, request, approval: config.approval, signer })
    : client.purchase({ id, approvalId: config.approvalId, request });
}
