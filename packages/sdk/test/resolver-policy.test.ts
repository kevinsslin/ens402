import { describe, expect, it } from "vitest";
import { keccak256, stringToHex, type Address } from "viem";
import { checkResolverPolicy, type CurrentResolverPolicy } from "../src/ens/resolver-policy";
const registry = `0x${"1".repeat(40)}` as Address;
const resolver = `0x${"2".repeat(40)}` as Address;
const other = `0x${"3".repeat(40)}` as Address;
const policy: CurrentResolverPolicy = { mode: "provider-shared", providerName: "dataco.ens402.eth", providerRegistry: registry, resolver };
const input = { policy, name: "weather.dataco.ens402.eth", parentRegistry: registry, resolver, recordId: 1n, recordCount: 3n };
describe("provider resolver permission boundary", () => {
  it("accepts distinct bundles for direct siblings in the configured provider", () => {
    expect(checkResolverPolicy(input).authorityParts[0]).toBe("provider-shared");
    expect(checkResolverPolicy({ ...input, name: "research.dataco.ens402.eth", recordId: 2n }).authorityParts).toEqual(checkResolverPolicy(input).authorityParts);
  });
  it("rejects unlinked names even when a resolver has a default bundle", () => {
    expect(() => checkResolverPolicy({ ...input, recordId: 0n })).toThrow("default records");
  });
  it("rejects another provider, nested descendants and different registry/resolver pins", () => {
    for (const changes of [{ name: "weather.other.ens402.eth" }, { name: "v1.weather.dataco.ens402.eth" }, { parentRegistry: other }, { resolver: other }]) {
      expect(() => checkResolverPolicy({ ...input, ...changes })).toThrow("configured provider");
    }
  });
  it("dedicated remains explicit and does not claim alias exclusivity", () => {
    expect(() => checkResolverPolicy({ ...input, policy: { mode: "dedicated" } })).toThrow("one record");
    const result = checkResolverPolicy({ ...input, policy: { mode: "dedicated" }, recordCount: 1n });
    expect(result.coverage.join(" ")).toContain("aliases are not enumerated");
  });
  it("discloses linked alias and resolver-wide permissions trust limits", () => {
    const result = checkResolverPolicy(input);
    expect(result.coverage.join(" ")).toContain("exclusive resolver membership is not proven");
    expect(result.coverage.join(" ")).toContain("not individual services");
  });
  it("authority inputs bind policy group and record ID while count growth is harmless", () => {
    const authority = (value: typeof input) => keccak256(stringToHex([value.parentRegistry, value.resolver, value.recordId, ...checkResolverPolicy(value).authorityParts].join(":")));
    expect(authority(input)).not.toBe(authority({ ...input, recordId: 2n }));
    expect(authority(input)).toBe(authority({ ...input, recordCount: 4n }));
    expect(authority(input)).not.toBe(authority({ ...input, parentRegistry: other, policy: { ...policy, providerRegistry: other } }));
  });
});

it("Guard holds an approval when the resolved authority changes", async () => {
  const { verifyRequest, NETWORK, USDC } = await import("../src/index");
  const service = {
    name: input.name, endpoint: "https://example.com/weather", status: "active", authority: "provider-registry:resolver:record-2", block: "123", observedAt: 100,
    payment: { version: 2 as const, scheme: "exact" as const, network: NETWORK, asset: USDC, payTo: other, pricing: { model: "fixed" as const, amount: "1000", unit: "request" as const } },
  };
  const decision = verifyRequest(service, service.endpoint,
    { scheme: "exact", network: NETWORK, asset: USDC, payTo: other, amount: "1000", maxTimeoutSeconds: 30 },
    { name: input.name, authority: "provider-registry:resolver:record-1", endpoints: [service.endpoint], payTo: other, maxAmount: "1000", expiresAt: 1000 }, 100);
  expect(decision).toEqual({ outcome: "hold", reason: "Service identity needs approval" });
});

it("binds discovered namespace providers to their actual chain registry and resolver",()=>{
 const dynamic={...input,policy:{mode:"namespace" as const,roots:["ens402.eth"]}};
 expect(checkResolverPolicy(dynamic).authorityParts).toEqual(checkResolverPolicy(input).authorityParts);
 expect(checkResolverPolicy({...dynamic,resolver:other}).authorityParts).not.toEqual(checkResolverPolicy(dynamic).authorityParts);
 for(const name of ["weather.evilens402.eth","v1.weather.dataco.ens402.eth","dataco.ens402.eth"]) expect(()=>checkResolverPolicy({...dynamic,name})).toThrow();
 expect(()=>checkResolverPolicy({...dynamic,recordId:0n})).toThrow();
});
