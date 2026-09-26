import { Pool } from "pg";
import { NETWORK, USDC, addressPattern, validAmount } from "@ens402/sdk";
import { normalize } from "viem/ens";
import { searchDiscovery, type Catalog } from "./discovery";
export type TransferClass = "verified" | "facilitator" | "unclassified";
export type AnalyticsTransfer = {
  transactionHash: string;
  logIndex: number;
  blockNumber: string;
  blockHash: string;
  timestamp: number;
  from: string;
  to: string;
  amountAtomic: string;
  classification: "facilitator" | "unclassified";
  facilitatorVersion?: string;
};
export type Metric = {
  amountAtomic: string;
  count: number;
  uniquePayers: number;
};
export type AnalyticsReport = {
  network: typeof NETWORK;
  asset: typeof USDC;
  decimals: 6;
  window: { since: number; until: number };
  providerName: string;
  checkpoint: { blockNumber: string; blockHash: string } | null;
  groups: Array<{
    payTo: string;
    services: string[];
    associations: Array<{
      name: string;
      controlIdentity: string;
      since: number;
      until: number | null;
    }>;
    totals: Record<TransferClass, Metric>;
    total: Metric;
  }>;
  coverage: "finalized-observed-address-receipts";
  warnings: string[];
};
const schema = `
CREATE TABLE IF NOT EXISTS analytics_epochs (
 id bigserial PRIMARY KEY, name text NOT NULL, provider text NOT NULL, pay_to text NOT NULL,
 identity text NOT NULL, since bigint NOT NULL, until bigint, source_block text NOT NULL,
 UNIQUE(name,since), CHECK(until IS NULL OR until>=since)
);
CREATE UNIQUE INDEX IF NOT EXISTS analytics_epoch_current ON analytics_epochs(name) WHERE until IS NULL;
CREATE TABLE IF NOT EXISTS analytics_receipts (
 transaction_hash text NOT NULL, log_index integer NOT NULL, block_number numeric(78,0) NOT NULL,
 block_hash text NOT NULL, timestamp bigint NOT NULL, payer text NOT NULL, pay_to text NOT NULL,
 amount numeric(78,0) NOT NULL CHECK(amount>=0), classification text NOT NULL CHECK(classification IN('verified','facilitator','unclassified')),
 facilitator_version text, proof_nonce text, PRIMARY KEY(transaction_hash,log_index)
);
ALTER TABLE analytics_receipts ADD COLUMN IF NOT EXISTS proof_checked_at bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS analytics_receipt_address_time ON analytics_receipts(pay_to,timestamp);
CREATE TABLE IF NOT EXISTS analytics_checkpoints (block_number numeric(78,0) PRIMARY KEY, block_hash text NOT NULL);
CREATE TABLE IF NOT EXISTS analytics_catalog_state (id integer PRIMARY KEY CHECK(id=1), observed_at bigint NOT NULL, source_id text NOT NULL);
ALTER TABLE analytics_catalog_state ADD COLUMN IF NOT EXISTS source_block numeric(78,0) NOT NULL DEFAULT 0;
`;
function address(value: string) {
  if (!addressPattern.test(value)) throw new Error("Invalid analytics address");
  return value.toLowerCase();
}
function hash(value: string) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value))
    throw new Error("Invalid analytics hash");
  return value.toLowerCase();
}
function time(value: number) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error("Invalid analytics timestamp");
  return value;
}
export class AnalyticsStore {
  private pool: Pool;
  constructor(url: string) {
    this.pool = new Pool({
      connectionString: url,
      max: 4,
      statement_timeout: 15000,
    });
  }
  async close() {
    await this.pool.end();
  }
  async migrate() {
    await this.pool.query(schema);
  }
  /** Identities come from block-pinned native ENS traversal, never a merchant-provided ownership claim. */
  async observe(
    catalog: Catalog,
    identities: Record<string, string>,
    observedAt = Math.floor(Date.now() / 1000),
  ) {
    time(observedAt);
    await searchDiscovery(
      {},
      { source: { load: async () => catalog }, now: observedAt },
    );
    if (!catalog.checkpoint || catalog.source.kind !== "indexer")
      throw new Error(
        "Native indexed catalog required for analytics association",
      );
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(4022701)");
      const prior = (
        await c.query("SELECT * FROM analytics_catalog_state WHERE id=1")
      ).rows[0];
      if (
        prior &&
        (prior.source_id !== catalog.source.id ||
          Number(prior.observed_at) > observedAt ||
          BigInt(prior.source_block) > BigInt(catalog.checkpoint.blockNumber))
      )
        throw new Error("Analytics source changed or time moved backwards");
      const active = catalog.services.filter(
        (row) =>
          row.service.status === "active" && row.service.expiresAt > observedAt,
      );
      const names: string[] = [];
      for (const { service } of active) {
        if (!identities[service.name])
          throw new Error("Missing verified control identity");
        const identity = hash(identities[service.name]!);
        const payTo = address(service.payTo);
        names.push(service.name);
        const old = (
          await c.query(
            "SELECT * FROM analytics_epochs WHERE name=$1 AND until IS NULL",
            [service.name],
          )
        ).rows[0];
        if (old?.identity === identity && old.pay_to === payTo) continue;
        if (old && Number(old.since) >= observedAt)
          throw new Error("Conflicting observations at same timestamp");
        await c.query(
          "UPDATE analytics_epochs SET until=$2 WHERE name=$1 AND until IS NULL",
          [service.name, observedAt],
        );
        await c.query(
          "INSERT INTO analytics_epochs(name,provider,pay_to,identity,since,source_block) VALUES($1,$2,$3,$4,$5,$6)",
          [
            service.name,
            service.name.split(".").slice(1).join("."),
            payTo,
            identity,
            observedAt,
            catalog.checkpoint.blockNumber,
          ],
        );
      }
      await c.query(
        "UPDATE analytics_epochs SET until=$2 WHERE until IS NULL AND NOT(name=ANY($1::text[]))",
        [names, observedAt],
      );
      await c.query(
        "INSERT INTO analytics_catalog_state(id,observed_at,source_id,source_block) VALUES(1,$1,$2,$3) ON CONFLICT(id) DO UPDATE SET observed_at=EXCLUDED.observed_at,source_block=EXCLUDED.source_block",
        [observedAt, catalog.source.id, catalog.checkpoint.blockNumber],
      );
      await c.query("COMMIT");
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
  async addresses(): Promise<string[]> {
    return (
      await this.pool.query("SELECT DISTINCT pay_to FROM analytics_epochs")
    ).rows.map((row) => row.pay_to);
  }
  async checkpoints(): Promise<
    Array<{ blockNumber: string; blockHash: string }>
  > {
    return (
      await this.pool.query(
        "SELECT block_number::text,block_hash FROM analytics_checkpoints ORDER BY block_number DESC",
      )
    ).rows.map((row) => ({
      blockNumber: row.block_number,
      blockHash: row.block_hash,
    }));
  }
  async rewind(fromBlock: bigint) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("DELETE FROM analytics_receipts WHERE block_number>=$1", [
        String(fromBlock),
      ]);
      await c.query(
        "DELETE FROM analytics_checkpoints WHERE block_number>=$1",
        [String(fromBlock)],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async ingest(
    rows: AnalyticsTransfer[],
    checkpoint: { blockNumber: string; blockHash: string },
  ) {
    if (!validAmount(checkpoint.blockNumber))
      throw new Error("Invalid checkpoint");
    hash(checkpoint.blockHash);
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      for (const row of rows) {
        if (
          !validAmount(row.blockNumber) ||
          BigInt(row.blockNumber) > BigInt(checkpoint.blockNumber) ||
          !validAmount(row.amountAtomic) ||
          !Number.isSafeInteger(row.logIndex) ||
          row.logIndex < 0 ||
          !["facilitator", "unclassified"].includes(row.classification)
        )
          throw new Error("Invalid transfer");
        if (row.classification === "facilitator" && !row.facilitatorVersion)
          throw new Error("Facilitator evidence version required");
        const result = await c.query(
          `INSERT INTO analytics_receipts(transaction_hash,log_index,block_number,block_hash,timestamp,payer,pay_to,amount,classification,facilitator_version)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(transaction_hash,log_index) DO NOTHING RETURNING transaction_hash`,
          [
            hash(row.transactionHash),
            row.logIndex,
            row.blockNumber,
            hash(row.blockHash),
            time(row.timestamp),
            address(row.from),
            address(row.to),
            row.amountAtomic,
            row.classification,
            row.facilitatorVersion ?? null,
          ],
        );
        if (!result.rowCount) {
          const old = (
            await c.query(
              "SELECT block_hash,amount::text,pay_to,payer FROM analytics_receipts WHERE transaction_hash=$1 AND log_index=$2",
              [hash(row.transactionHash), row.logIndex],
            )
          ).rows[0];
          if (
            old.block_hash !== hash(row.blockHash) ||
            old.amount !== row.amountAtomic ||
            old.pay_to !== address(row.to) ||
            old.payer !== address(row.from)
          )
            throw new Error("Conflicting transfer requires canonical rewind");
        }
      }
      const existing = (
        await c.query(
          "SELECT block_hash FROM analytics_checkpoints WHERE block_number=$1",
          [checkpoint.blockNumber],
        )
      ).rows[0];
      if (existing && existing.block_hash !== hash(checkpoint.blockHash))
        throw new Error("Conflicting checkpoint requires canonical rewind");
      await c.query(
        "INSERT INTO analytics_checkpoints(block_number,block_hash) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [checkpoint.blockNumber, hash(checkpoint.blockHash)],
      );
      await c.query("COMMIT");
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
  /** Called only after the worker independently validates receipt + exact authorization evidence. No public mutation API. */
  async markVerified(proof: {
    transactionHash: string;
    logIndex: number;
    blockHash: string;
    nonce: string;
  }) {
    const result = await this.pool.query(
      "UPDATE analytics_receipts SET classification='verified',proof_nonce=$4 WHERE transaction_hash=$1 AND log_index=$2 AND block_hash=$3",
      [
        hash(proof.transactionHash),
        proof.logIndex,
        hash(proof.blockHash),
        hash(proof.nonce),
      ],
    );
    if (!result.rowCount)
      throw new Error("Verified proof has no canonical indexed transfer");
  }
  /** Fair retry queue over already indexed transfers; unknown public receipts never gain a proof. */
  async proofCandidates(limit = 100): Promise<string[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
      throw new Error("Invalid proof batch size");
    return (
      await this.pool.query(
        "SELECT transaction_hash FROM analytics_receipts WHERE classification<>'verified' GROUP BY transaction_hash ORDER BY min(proof_checked_at),transaction_hash LIMIT $1",
        [limit],
      )
    ).rows.map((row) => row.transaction_hash);
  }
  async proofChecked(
    transactions: string[],
    checkedAt = Math.floor(Date.now() / 1000),
  ) {
    await this.pool.query(
      "UPDATE analytics_receipts SET proof_checked_at=$2 WHERE transaction_hash=ANY($1::text[])",
      [transactions.map(hash), time(checkedAt)],
    );
  }
  async report(
    providerName: string,
    since: number | undefined = undefined,
    until = Math.floor(Date.now() / 1000),
  ): Promise<AnalyticsReport> {
    const defaultWindow = since === undefined;
    since ??= 0;
    if (
      normalize(providerName) !== providerName ||
      !providerName.endsWith(".eth")
    )
      throw new Error("Invalid provider name");
    time(since);
    time(until);
    if (until < since) throw new Error("Invalid analytics window");
    const epochs = (
      await this.pool.query(
        "SELECT * FROM analytics_epochs WHERE provider=$1 AND since<$3 AND (until IS NULL OR until>$2) ORDER BY since",
        [providerName, since, until],
      )
    ).rows;
    const groups: AnalyticsReport["groups"] = [];
    for (const payTo of [...new Set<string>(epochs.map((row) => row.pay_to))]) {
      const records = (
        await this.pool.query(
          `SELECT r.classification,sum(r.amount)::text AS amount,count(*)::text AS count,count(DISTINCT r.payer)::text AS unique_payers
        FROM analytics_receipts r WHERE r.pay_to=$1 AND r.timestamp>=$2 AND r.timestamp<$3
        AND EXISTS(SELECT 1 FROM analytics_epochs e WHERE e.provider=$4 AND e.pay_to=r.pay_to AND r.timestamp>=e.since AND (e.until IS NULL OR r.timestamp<e.until))
        GROUP BY GROUPING SETS ((r.classification),())`,
          [payTo, since, until, providerName],
        )
      ).rows;
      const metric = (classification: TransferClass | null): Metric => {
        const row = records.find(
          (row) => row.classification === classification,
        );
        return {
          amountAtomic: row?.amount ?? "0",
          count: Number(row?.count ?? 0),
          uniquePayers: Number(row?.unique_payers ?? 0),
        };
      };
      groups.push({
        payTo,
        associations: epochs
          .filter((row) => row.pay_to === payTo)
          .map((row) => ({
            name: row.name,
            controlIdentity: row.identity,
            since: Number(row.since),
            until: row.until === null ? null : Number(row.until),
          })),
        services: [
          ...new Set<string>(
            epochs.filter((row) => row.pay_to === payTo).map((row) => row.name),
          ),
        ],
        total: metric(null),
        totals: {
          verified: metric("verified"),
          facilitator: metric("facilitator"),
          unclassified: metric("unclassified"),
        },
      });
    }
    return {
      network: NETWORK,
      asset: USDC,
      decimals: 6,
      providerName,
      window: {
        since: defaultWindow
          ? epochs.length
            ? Math.min(...epochs.map((row) => Number(row.since)))
            : until
          : since,
        until,
      },
      checkpoint: (await this.checkpoints())[0] ?? null,
      groups,
      coverage: "finalized-observed-address-receipts",
      warnings: [
        "Public ENS address association does not prove merchant ownership of that address.",
        "Counts cover observed listing intervals, not global revenue, profit or delivery success.",
        "Shared addresses are counted once per provider; services are not independently attributed.",
        "Facilitator classification is a versioned sender heuristic, not proof of x402.",
        "Control epochs record observed changes; intermediate changes between snapshots may be missed.",
        "Verified coverage is limited to this operator's terminal ENS402 ledger evidence that passes independent finalized-chain checks.",
      ],
    };
  }
}
