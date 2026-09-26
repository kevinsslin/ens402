import { describe, it, expect, vi } from "vitest";
import type { PublicClient } from "viem";
import type { AnalyticsStore } from "../../packages/server/src/analytics";
import { scanAnalytics } from "./analytics";
import { NETWORK } from "../../packages/sdk/src/index";
const address = `0x${"1".repeat(40)}` as const,
  hash = `0x${"a".repeat(64)}` as const,
  other = `0x${"b".repeat(64)}` as const;
function fixture() {
  const store = {
    checkpoints: vi.fn(
      async () => [] as Array<{ blockNumber: string; blockHash: string }>,
    ),
    addresses: vi.fn(async () => [address]),
    rewind: vi.fn(),
    ingest: vi.fn(),
  };
  const client = {
    getChainId: async () => 84532,
    getBlock: vi.fn(async () => ({ number: 10n, hash, timestamp: 100n })),
    getLogs: vi.fn(async () => [
      {
        transactionHash: hash,
        blockNumber: 10n,
        blockHash: hash,
        logIndex: 0,
        removed: false,
        args: { from: address, to: address, value: 9007199254740993n },
      },
    ]),
    getTransactionReceipt: vi.fn(async () => ({
      status: "success",
      blockHash: hash,
    })),
    getTransaction: async () => ({ from: address }),
  };
  return {
    store,
    client,
    run: () =>
      scanAnalytics(
        client as unknown as PublicClient,
        store as unknown as AnalyticsStore,
        {
          fromBlock: 10n,
          facilitators: {
            version: "reviewed-v1",
            network: NETWORK,
            addresses: [address],
          },
        },
      ),
  };
}
describe("finalized analytics scanner", () => {
  it("indexes exact bigint transfers and marks only facilitator heuristic", async () => {
    const f = fixture();
    await f.run();
    const row = f.store.ingest.mock.calls[0]![0] as unknown as Array<{
      amountAtomic: string;
      classification: string;
    }>;
    expect(row[0]?.amountAtomic).toBe("9007199254740993");
    expect(row[0]?.classification).toBe("facilitator");
    expect(f.client.getLogs.mock.calls[0]).toBeDefined();
  });
  it("rewinds an orphaned checkpoint and replays canonical history", async () => {
    const f = fixture();
    f.store.checkpoints.mockResolvedValue([
      { blockNumber: "10", blockHash: other },
    ]);
    await f.run();
    expect(f.store.rewind).toHaveBeenCalledWith(10n);
    expect(f.store.ingest).toHaveBeenCalledTimes(1);
  });
  it("rejects a reorg or unsuccessful receipt without advancing checkpoint", async () => {
    const f = fixture();
    f.client.getTransactionReceipt.mockResolvedValue({
      status: "reverted",
      blockHash: hash,
    });
    await expect(f.run()).rejects.toThrow("Receipt changed");
    expect(f.store.ingest).not.toHaveBeenCalled();
  });
  it("does not scan pending blocks above finalized checkpoint", async () => {
    const f = fixture();
    f.store.checkpoints.mockResolvedValue([
      { blockNumber: "10", blockHash: hash },
    ]);
    await f.run();
    expect(f.client.getLogs).not.toHaveBeenCalled();
  });
});

it("upgrades only an exact finalized authorization receipt and rejects ambiguous transfers", async () => {
  const { verifyAnalyticsPayment } = await import("./analytics");
  const { encodeEventTopics, encodeAbiParameters, parseAbi } = await import(
    "viem"
  );
  const { USDC } = await import("../../packages/sdk/src/index");
  const events = parseAbi([
    "event Transfer(address indexed from,address indexed to,uint256 value)",
    "event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)",
  ]);
  const logs = [
    {
      address: USDC,
      logIndex: 0,
      data: encodeAbiParameters([{ type: "uint256" }], [100n]),
      topics: encodeEventTopics({
        abi: events,
        eventName: "Transfer",
        args: { from: address, to: address },
      }),
    },
    {
      address: USDC,
      logIndex: 1,
      data: "0x",
      topics: encodeEventTopics({
        abi: events,
        eventName: "AuthorizationUsed",
        args: { authorizer: address, nonce: hash },
      }),
    },
  ];
  const receipt = {
    status: "success",
    blockNumber: 10n,
    blockHash: hash,
    transactionHash: hash,
    logs,
  };
  const client = {
    getChainId: async () => 84532,
    waitForTransactionReceipt: async () => receipt,
    getTransactionReceipt: async () => receipt,
    getBlock: async () => ({ number: 10n, hash }),
  } as unknown as PublicClient;
  const markVerified = vi.fn();
  const store = { markVerified } as unknown as AnalyticsStore;
  const input = {
    settlement: {
      success: true,
      network: NETWORK,
      transaction: hash,
      payer: address,
    },
    authorization: {
      from: address,
      to: address,
      value: "100",
      validAfter: "0",
      validBefore: "1000",
      nonce: hash,
    },
    requirement: {
      scheme: "exact",
      network: NETWORK,
      asset: USDC,
      amount: "100",
      payTo: address,
      maxTimeoutSeconds: 60,
      extra: { name: "USDC", version: "2" },
    },
  };
  await expect(
    verifyAnalyticsPayment(client, store, {
      ...input,
      authorization: { ...input.authorization, value: "101" },
    }),
  ).rejects.toThrow("bind");
  await verifyAnalyticsPayment(client, store, input);
  expect(markVerified).toHaveBeenCalledOnce();
  receipt.logs.push({ ...logs[0]!, logIndex: 2 });
  await expect(verifyAnalyticsPayment(client, store, input)).rejects.toThrow(
    "Ambiguous",
  );
  receipt.logs.splice(1);
  await expect(verifyAnalyticsPayment(client, store, input)).rejects.toThrow(
    "authorization",
  );
});
