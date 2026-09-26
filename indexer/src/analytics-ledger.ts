import type { PublicClient } from "viem";
import type { AnalyticsStore } from "../../packages/server/src/analytics";
import type { LedgerEvidenceSource } from "../../packages/server/src/analytics-ledger";
import { verifyAnalyticsPayment } from "./analytics";
/** Only locally recorded terminal payments are candidates; every proof is independently rechecked onchain. */
export async function importLedgerProofs(
  client: PublicClient,
  store: AnalyticsStore,
  source: LedgerEvidenceSource,
  limit = 100,
) {
  const transactions = await store.proofCandidates(limit);
  if (!transactions.length)
    return { verified: 0, deferred: 0, withoutLocalEvidence: 0 };
  const evidence = await source.find(transactions);
  let verified = 0,
    deferred = 0;
  const covered = new Set<string>();
  for (const proof of evidence) {
    const tx = proof?.settlement?.transaction?.toLowerCase();
    if (!tx || !transactions.includes(tx)) continue;
    if (covered.has(tx)) continue;
    covered.add(tx);
    try {
      await verifyAnalyticsPayment(client, store, proof);
      verified++;
    } catch {
      deferred++;
    }
  }
  await store.proofChecked(transactions);
  return {
    verified,
    deferred,
    withoutLocalEvidence: transactions.length - covered.size,
  };
}
