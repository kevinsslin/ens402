import { Pool } from "pg";
import type { PaymentRequirements, SettleResponse } from "@x402/core/types";
import type { PublicAuthorization } from "@ens402/sdk/http";
export type LocalPaymentEvidence = {
  settlement: SettleResponse;
  authorization: PublicAuthorization;
  requirement: PaymentRequirements;
};
export interface LedgerEvidenceSource {
  find(transactions: string[]): Promise<LocalPaymentEvidence[]>;
}
/** Worker-only adapter. Never imported by public analytics/discovery routes. All sessions are read-only. */
export class LocalLedgerEvidenceSource implements LedgerEvidenceSource {
  private pool: Pool;
  constructor(url: string) {
    this.pool = new Pool({
      connectionString: url,
      max: 1,
      statement_timeout: 15000,
      options: "-c default_transaction_read_only=on",
    });
  }
  async close() {
    await this.pool.end();
  }
  async find(transactions: string[]): Promise<LocalPaymentEvidence[]> {
    if (
      transactions.length > 1000 ||
      transactions.some((hash) => !/^0x[0-9a-f]{64}$/.test(hash))
    )
      throw new Error("Invalid evidence lookup");
    const rows = await this.pool.query(
      `SELECT receipt->'settlement' AS settlement,"authorization",requirement FROM ens402_executions
      WHERE state IN ('settled','paid_delivery_failed') AND receipt->>'state' IN ('settled','paid_delivery_failed')
      AND lower(receipt->'settlement'->>'transaction')=ANY($1::text[])
      AND "authorization" IS NOT NULL AND requirement IS NOT NULL`,
      [transactions],
    );
    return rows.rows as LocalPaymentEvidence[];
  }
}
