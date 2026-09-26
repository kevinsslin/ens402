import "./handlers/native";
import { describe, expect, it } from "vitest";
import { createTestIndexer } from "envio";

const resolver = "0x0000000000000000000000000000000000000042";
const owner = "0x0000000000000000000000000000000000000001";
describe("native event indexer", () => {
  it("retains initial record events before factory discovery and dynamically follows provider registries", async () => {
    const indexer = createTestIndexer();
    await indexer.process({ chains: { 11155111: { simulate: [
      { contract: "Resolver", event: "TextUpdated", srcAddress: resolver, params: { recordId: 1n, keyHash: "description", key: "description", value: "First record" } },
      { contract: "Factory", event: "ProxyDeployed", params: { sender: owner, proxyAddress: resolver, salt: 1n, implementation: "0x14f09fd05d4585759e54844dc9b00147131cf243" } },
      { contract: "Registry", event: "SubregistryUpdated", params: { tokenId: 1n, subregistry: "0x0000000000000000000000000000000000000043", sender: owner } },
    ] } } });
    const events = await indexer.NativeEvent.getAll();
    expect(events.some(e => e.kind === "Resolver.TextUpdated" && e.params.includes("First record"))).toBe(true);
    expect(indexer.chains[11155111].Resolver.addresses.map(x => x.toLowerCase())).toContain(resolver);
    expect(indexer.chains[11155111].Registry.addresses.map(x => x.toLowerCase())).toContain("0x0000000000000000000000000000000000000043");
  });
});
