import { describe, expect, it, vi } from "vitest";
import { createMultiBaasEnsEventReader } from "../src/multibaas.js";

const contractAddress = `0x${"a".repeat(40)}`;
const txHash = `0x${"b".repeat(64)}`;
const config = {
  deploymentUrl: "https://example.multibaas.com", apiKey: "private-test-key",
  contractAddress, contractKind: "Registry" as const,
};
function response(result: unknown) {
  return new Response(JSON.stringify({ status: 200, message: "OK", result }), { status: 200 });
}
function fetcherWithEvents(events: unknown[], chainID = 11155111) {
  return vi.fn<typeof fetch>()
    .mockImplementationOnce(async () => response({ chainID }))
    .mockImplementationOnce(async () => response(events));
}
function event(overrides: Record<string, unknown> = {}) {
  return {
    triggeredAt: "2026-09-27T00:00:00Z",
    transaction: { txHash, blockNumber: 123 },
    event: {
      name: "LabelRegistered", indexInLog: 2, contract: { address: contractAddress },
      inputs: [{ name: "label", value: "demo" }, { name: "tokenId", value: "123" }],
    },
    ...overrides,
  };
}

describe("MultiBaas indexed ENSv2 event reader", () => {
  it("reads a bounded contract-specific event page as observation only", async () => {
    const fetcher = fetcherWithEvents([event()]);
    const page = await createMultiBaasEnsEventReader(config, fetcher)({ limit: 2 });
    expect(page).toEqual({
      events: [{
        kind: "multibaas_indexed_ens_event", authority: "observation_only", chainId: 11155111,
        contractKind: "Registry", contractAddress, eventName: "LabelRegistered", txHash,
        blockNumber: 123, logIndex: 2, observedAt: "2026-09-27T00:00:00Z",
        inputs: { label: "demo", tokenId: "123" },
      }], hasMore: false, nextOffset: 1,
    });
    expect(new URL(String(fetcher.mock.calls[0]![0])).pathname).toBe("/api/v0/chains/ethereum/status");
    const [url, options] = fetcher.mock.calls[1]!;
    const parsed = new URL(String(url));
    expect(parsed.pathname).toBe("/api/v0/events");
    expect(parsed.searchParams.get("contractAddress")).toBe(contractAddress);
    expect(parsed.searchParams.get("limit")).toBe("2");
    expect(options?.headers).toEqual({ Authorization: "Bearer private-test-key", Accept: "application/json" });
  });

  it("supports event selection while excluding unrelated indexed events", async () => {
    const unrelated = event({ event: { ...event().event, name: "TransferSingle" } });
    const fetcher = fetcherWithEvents([unrelated, event()]);
    const page = await createMultiBaasEnsEventReader(config, fetcher)({ eventName: "LabelRegistered", limit: 2 });
    expect(page.events.map(item => item.eventName)).toEqual(["LabelRegistered"]);
    expect(page.hasMore).toBe(true);
    expect(page.nextOffset).toBe(2);
  });

  it("rejects wrong chain or wrong contract", async () => {
    const wrongChain = fetcherWithEvents([], 84532);
    await expect(createMultiBaasEnsEventReader(config, wrongChain)()).rejects.toThrow("not Ethereum Sepolia");
    expect(wrongChain).toHaveBeenCalledTimes(1);
    const wrongContract = fetcherWithEvents([event({ event: { ...event().event, contract: { address: `0x${"c".repeat(40)}` } } })]);
    await expect(createMultiBaasEnsEventReader(config, wrongContract)()).rejects.toThrow("contract mismatch");
  });

  it("rejects malformed configuration, unsupported names and unbounded pages", async () => {
    expect(() => createMultiBaasEnsEventReader({ ...config, deploymentUrl: "http://example.com" })).toThrow();
    expect(() => createMultiBaasEnsEventReader({ ...config, apiKey: "\n" })).toThrow();
    expect(() => createMultiBaasEnsEventReader({ ...config, contractAddress: "bad" })).toThrow();
    const fetcher = vi.fn<typeof fetch>();
    const reader = createMultiBaasEnsEventReader(config, fetcher);
    await expect(reader({ limit: 101 })).rejects.toThrow("page limit");
    await expect(reader({ eventName: "TextUpdated" })).rejects.toThrow("not supported");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps bearer credentials out of upstream errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error(config.apiKey));
    await expect(createMultiBaasEnsEventReader(config, fetcher)()).rejects.toThrow("MultiBaas request failed");
  });
});
