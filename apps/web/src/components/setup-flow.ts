export type PendingSetup = {
  hash: string;
  step: { signer: string; to?: string; data: string; value?: string; description: string };
};
/** Errors from a wallet can contain raw calldata and private RPC URLs. Show actionable copy instead. */
export function setupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/rate.?limit|429|too many requests/i.test(message)) return "The RPC or wallet simulation service is busy. Your setup is saved. If your wallet did not return a transaction hash, check its activity before trying again.";
  if (/reject|denied|4001/i.test(message)) return "Wallet request cancelled. Your setup is saved; continue when you are ready.";
  if (/http|calldata|request body/i.test(message) || message.length > 400) return "The wallet or network could not complete this step. Check wallet activity before retrying; your setup is saved.";
  return message;
}
export function setupStepCopy(description = "") {
  if (description === "Create provider registry") return { title: "Create your service directory", body: "Deploy a directory for the service names your provider will manage.", action: "Create directory", phase: 0 };
  if (description.startsWith("Register provider")) return { title: "Register your provider name", body: "Connect your ENS provider name to the directory you just created. The platform registrar signs this step.", action: "Register provider name", phase: 0 };
  if (description.startsWith("Deploy shared")) return { title: "Create shared service settings", body: "Create the resolver that stores descriptions, endpoints and payment terms for your services.", action: "Create shared settings", phase: 1 };
  if (description.startsWith("Deploy restricted")) return { title: "Create the service publisher", body: "Deploy the contract that registers services with your shared settings and wallet permissions.", action: "Create service publisher", phase: 2 };
  if (description.includes("ROLE_REGISTRAR")) return { title: "Enable service publishing", body: "Allow your verified publisher contract to register service names.", action: "Enable publishing", phase: 2 };
  const key = description.match(/^Grant (\S+) writer/)?.[1];
  if (key) {
    const label = ({ description: "service descriptions", avatar: "service images", "agent-endpoint[x402]": "API endpoints", "ens402.call": "call formats", "ens402.payment": "payment terms", "ens402.status": "service status" } as Record<string,string>)[key] ?? "service settings";
    return { title: `Allow updates to ${label}`, body: "Grant this specific permission to the wallet or publisher shown below. This transaction does not transfer your provider name.", action: "Grant permission", phase: 1 };
  }
  return { title: description || "Check saved setup", body: "Review this Sepolia setup transaction before signing.", action: "Continue in wallet", phase: 1 };
}
/** Read-only receipt polling. Never repeats a wallet submission, even after timeouts. */
export async function confirmSetup(pending: PendingSetup, options: { fetch?: typeof fetch; attempts?: number; delay?: (ms:number)=>Promise<void> } = {}) {
  const request = options.fetch ?? fetch;
  const delay = options.delay ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const attempts = options.attempts ?? 60;
  let unavailable = false;
  for (let i=0; i < attempts; i++) {
    // Retry only receipt reads. Validation failures must still stop immediately.
    let response: Response | undefined;
    try {
      response = await request(`/api/provider/receipt?hash=${encodeURIComponent(pending.hash)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    } catch {
      // Network interruptions and timeouts do not change the submitted transaction.
    }
    unavailable = !response || response.status === 408 || response.status === 429 || response.status >= 500;
    if (unavailable) {
      if (i + 1 < attempts) await delay(5000);
      continue;
    }
    if (!response!.ok) throw Error("Could not check this transaction. Your transaction is saved. Check its explorer link before continuing.");
    const receipt = await response!.json();
    if (receipt.status !== "pending") {
      if (receipt.hash?.toLowerCase() !== pending.hash.toLowerCase() || receipt.from?.toLowerCase() !== pending.step.signer.toLowerCase() || (receipt.to?.toLowerCase() ?? null) !== (pending.step.to?.toLowerCase() ?? null) || receipt.data?.toLowerCase() !== pending.step.data.toLowerCase() || BigInt(receipt.value ?? "-1") !== BigInt(pending.step.value ?? "0")) throw Error("Transaction does not match the saved setup. Stop and check the transaction in the explorer.");
      if (receipt.status === "success" && !pending.step.to && !/^0x[0-9a-fA-F]{40}$/.test(receipt.contractAddress ?? "")) throw Error("Deployment confirmation is missing its contract address. Keep this transaction saved and check again.");
      if (!["success", "reverted"].includes(receipt.status)) throw Error("Unexpected transaction status");
      return receipt as { status: "success" | "reverted"; contractAddress?: string | null };
    }
    if (i + 1 < attempts) await delay(5000);
  }
  if (unavailable) throw Error("Confirmation is temporarily unavailable. Your transaction is saved. Use Check transaction to continue; do not send it again.");
  throw Error("Still waiting for confirmation. Your transaction is saved. Use Check transaction to continue without signing again.");
}
