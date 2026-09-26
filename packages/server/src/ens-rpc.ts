import { createPublicClient, fallback, http, type PublicClient, type Transport } from "viem";
import { sepolia } from "viem/chains";
/** Read-only ENS clients use independent RPCs. Wallet submissions never use this retry path. */
export function createEnsClient(primary: string, additional = process.env.SEPOLIA_RPC_FALLBACK_URLS): PublicClient<Transport, typeof sepolia> {
  const urls = [...new Set([primary, ...(additional?.trim() ? additional.split(",").map(value => value.trim()).filter(Boolean) : (["localhost", "127.0.0.1", "::1"].includes(new URL(primary).hostname) ? [] : ["https://rpc.sepolia.ethpandaops.io"]))])];
  return createPublicClient({
    chain: sepolia,
    transport: fallback(urls.map(url => http(url, { timeout: 8000, retryCount: 0, batch: { wait: 20, batchSize: 50 } })), { retryCount: 1, retryDelay: 750, rank: false }),
    ccipRead: false,
    pollingInterval: 5000,
  });
}
