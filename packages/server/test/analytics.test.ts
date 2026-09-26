import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { AnalyticsStore, type AnalyticsTransfer } from "../src/analytics";
import { analyticsDatabaseUrl } from "../src/analytics-runtime";
import { NETWORK, USDC } from "@ens402/sdk";
import type { Catalog } from "../src/discovery";
const exec = promisify(execFile);
let dir: string, store: AnalyticsStore;
let databaseUrl: string;
let started = false;
const a = `0x${"1".repeat(40)}`,
  b = `0x${"2".repeat(40)}`,
  payer = `0x${"3".repeat(40)}`,
  hash = `0x${"a".repeat(64)}`,
  identity = `0x${"b".repeat(64)}`;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "ens402-analytics-"));
  const socket = createServer();
  await new Promise<void>((r) => socket.listen(0, "127.0.0.1", r));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((r) => socket.close(() => r()));
  await exec("initdb", [
    "-D",
    join(dir, "data"),
    "-U",
    "test",
    "-A",
    "trust",
    "--no-locale",
  ]);
  await exec("pg_ctl", [
    "-D",
    join(dir, "data"),
    "-l",
    join(dir, "log"),
    "-o",
    `-h 127.0.0.1 -p ${port} -k ${dir}`,
    "-w",
    "start",
  ]);
  started = true;
  databaseUrl = `postgres://test@127.0.0.1:${port}/postgres`;
  store = new AnalyticsStore(databaseUrl);
  await store.migrate();
}, 60000);
afterAll(async () => {
  await store?.close();
  if (started)
    await exec("pg_ctl", ["-D", join(dir, "data"), "-m", "fast", "-w", "stop"]);
  if (dir) await rm(dir, { recursive: true, force: true });
});
function catalog(payTo = a): Catalog {
  return {
    source: {
      id: "test",
      roots: ["ens402.eth"],
      kind: "indexer",
      updatedAt: 100,
    },
    checkpoint: {
      chainId: 11155111,
      fromBlock: "1",
      blockNumber: "100",
      blockHash: hash,
    },
    services: ["weather", "research"].map((label) => ({
      service: {
        name: `${label}.demo.ens402.eth`,
        description: label,
        endpoint: "https://example.com",
        paymentNetwork: NETWORK,
        assetAddress: USDC,
        pricePerRequestAtomic: "1",
        assetDecimals: 6,
        payTo,
        indexedAt: 100,
        indexedBlock: "100",
        expiresAt: 10000,
        status: "active",
        fixture: false,
        call: { method: "GET" },
      },
    })),
  };
}
const identities = {
  "weather.demo.ens402.eth": identity,
  "research.demo.ens402.eth": identity,
};
function transfer(id: number, timestamp = 110, to = a): AnalyticsTransfer {
  return {
    transactionHash: `0x${id.toString(16).padStart(64, "0")}`,
    logIndex: 0,
    blockNumber: String(id),
    blockHash: hash,
    timestamp,
    from: payer,
    to,
    amountAtomic: "9007199254740993",
    classification: "unclassified",
  };
}
describe("real PostgreSQL address analytics", () => {
  it("does not count receipts before listing and deduplicates shared addresses/retries", async () => {
    await store.observe(catalog(), identities, 100);
    await store.ingest([transfer(1, 99), transfer(2), transfer(2)], {
      blockNumber: "2",
      blockHash: hash,
    });
    const report = await store.report("demo.ens402.eth", 0, 200);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]?.services).toHaveLength(2);
    expect(report.groups[0]?.total).toEqual({
      amountAtomic: "9007199254740993",
      count: 1,
      uniquePayers: 1,
    });
    expect(report.groups[0]?.totals.unclassified.count).toBe(1);
  });
  it("keeps facilitator and independent verification distinct", async () => {
    const row = {
      ...transfer(3),
      classification: "facilitator" as const,
      facilitatorVersion: "test-v1",
    };
    await store.ingest([row], { blockNumber: "3", blockHash: hash });
    expect(
      (await store.report("demo.ens402.eth", 0, 200)).groups[0]?.totals
        .facilitator.count,
    ).toBe(1);
    await store.markVerified({
      transactionHash: row.transactionHash,
      logIndex: 0,
      blockHash: hash,
      nonce: identity,
    });
    expect(
      (await store.report("demo.ens402.eth", 0, 200)).groups[0]?.totals.verified
        .count,
    ).toBe(1);
  });
  it("preserves address rotation and control epochs without relabeling history", async () => {
    await store.observe(catalog(b), identities, 200);
    await store.ingest([transfer(4, 210, a), transfer(5, 210, b)], {
      blockNumber: "5",
      blockHash: hash,
    });
    const report = await store.report("demo.ens402.eth", 0, 300);
    expect(report.groups.find((x) => x.payTo === a)?.total.count).toBe(2);
    expect(report.groups.find((x) => x.payTo === b)?.total.count).toBe(1);
    expect(
      report.groups.find((x) => x.payTo === a)?.associations[0]?.until,
    ).toBe(200);
    await store.observe(
      catalog(b),
      Object.fromEntries(Object.keys(identities).map((name) => [name, hash])),
      220,
    );
    expect(
      (await store.report("demo.ens402.eth", 0, 300)).groups.find(
        (x) => x.payTo === b,
      )?.associations,
    ).toHaveLength(4);
  });
  it("rolls back conflicting receipts and supports canonical reorg replay", async () => {
    await expect(
      store.ingest([{ ...transfer(5, 210, b), blockHash: identity }], {
        blockNumber: "5",
        blockHash: identity,
      }),
    ).rejects.toThrow("rewind");
    await store.rewind(5n);
    await store.ingest([{ ...transfer(5, 210, b), blockHash: identity }], {
      blockNumber: "5",
      blockHash: identity,
    });
    expect((await store.checkpoints())[0]?.blockHash).toBe(identity);
  });
  it("closes mappings on removal and rejects caller-supplied verified labels", async () => {
    const removed = catalog(b);
    removed.services = [];
    await store.observe(removed, {}, 300);
    await store.ingest([transfer(6, 310, b)], {
      blockNumber: "6",
      blockHash: hash,
    });
    expect(
      (await store.report("demo.ens402.eth", 300, 400)).groups,
    ).toHaveLength(0);
    await expect(
      store.ingest([{ ...transfer(7), classification: "verified" as never }], {
        blockNumber: "7",
        blockHash: hash,
      }),
    ).rejects.toThrow("Invalid transfer");
  });
});
it("keeps analytics separate from private accounts", () => {
  expect(() =>
    analyticsDatabaseUrl({
      DATABASE_URL: "postgres://a@same/db",
      ANALYTICS_DATABASE_URL: "postgres://b@same/db",
    }),
  ).toThrow("separate");
});

it("reads only local terminal ledger evidence and independently verifies an indexed receipt", async () => {
  const { Pool } = await import("pg");
  const { LocalLedgerEvidenceSource } = await import("../src/analytics-ledger");
  const { importLedgerProofs } = await import(
    "../../../indexer/src/analytics-ledger"
  );
  const { encodeEventTopics, encodeAbiParameters, parseAbi } = await import(
    "viem"
  );
  const setup = new Pool({ connectionString: databaseUrl });
  await setup.query("CREATE DATABASE ledger_fixture");
  await setup.end();
  const ledgerUrl = databaseUrl.replace("/postgres", "/ledger_fixture");
  const writer = new Pool({ connectionString: ledgerUrl });
  await writer.query(
    'CREATE TABLE ens402_executions(state text,receipt jsonb,"authorization" jsonb,requirement jsonb)',
  );
  const tx = `0x${"9".repeat(64)}`;
  const authorization = {
    from: payer,
    to: b,
    value: "100",
    validAfter: "0",
    validBefore: "1000",
    nonce: identity,
  };
  const requirement = {
    scheme: "exact",
    network: NETWORK,
    asset: USDC,
    payTo: b,
    amount: "100",
    maxTimeoutSeconds: 60,
  };
  const settlement = {
    success: true,
    transaction: tx,
    network: NETWORK,
    payer,
  };
  await writer.query("INSERT INTO ens402_executions VALUES($1,$2,$3,$4)", [
    "settled",
    { state: "settled", settlement },
    authorization,
    requirement,
  ]);
  await writer.query("INSERT INTO ens402_executions VALUES($1,$2,$3,$4)", [
    "uncertain",
    { state: "uncertain", settlement: { ...settlement, transaction: hash } },
    authorization,
    requirement,
  ]);
  const source = new LocalLedgerEvidenceSource(ledgerUrl);
  try {
    expect(await source.find([hash])).toHaveLength(0);
    expect(await source.find([tx])).toHaveLength(1);
    await store.ingest(
      [{ ...transfer(9, 250, b), transactionHash: tx, amountAtomic: "100" }],
      { blockNumber: "9", blockHash: hash },
    );
    const events = parseAbi([
      "event Transfer(address indexed from,address indexed to,uint256 value)",
      "event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)",
    ]);
    const receipt = {
      status: "success",
      blockNumber: 9n,
      blockHash: hash,
      transactionHash: tx,
      logs: [
        {
          address: USDC,
          logIndex: 0,
          data: encodeAbiParameters([{ type: "uint256" }], [100n]),
          topics: encodeEventTopics({
            abi: events,
            eventName: "Transfer",
            args: { from: payer as `0x${string}`, to: b as `0x${string}` },
          }),
        },
        {
          address: USDC,
          logIndex: 1,
          data: "0x",
          topics: encodeEventTopics({
            abi: events,
            eventName: "AuthorizationUsed",
            args: {
              authorizer: payer as `0x${string}`,
              nonce: identity as `0x${string}`,
            },
          }),
        },
      ],
    };
    const client = {
      getChainId: async () => 84532,
      waitForTransactionReceipt: async () => receipt,
      getTransactionReceipt: async () => receipt,
      getBlock: async () => ({ number: 10n, hash }),
    } as unknown as import("viem").PublicClient;
    const result = await importLedgerProofs(client, store, source);
    expect(result.verified).toBe(1);
    expect(result.withoutLocalEvidence).toBeGreaterThan(0);
    expect(
      (await store.report("demo.ens402.eth", 200, 300)).groups.find(
        (group) => group.payTo === b,
      )?.totals.verified.amountAtomic,
    ).toBe("100");
  } finally {
    await source.close();
    await writer.end();
  }
});
