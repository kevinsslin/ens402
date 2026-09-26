import { describe, expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import { providerInitialization, providerLabel, providerRegistryAbi, providerRoles } from "./provider-config";

describe("provider namespace plan", () => {
  it("rejects nested names and invalid provider labels", () => {
    expect(providerLabel("DataCo")).toBe("dataco");
    for (const label of ["a.b", "-bad", "bad-", "", "a".repeat(64)])
      expect(() => providerLabel(label)).toThrow();
  });
  it("initializes registration rights without inherited pointer or resolver authority", () => {
    const admin = "0x0000000000000000000000000000000000000001";
    const decoded = decodeFunctionData({ abi: providerRegistryAbi, data: providerInitialization(admin) });
    expect(decoded.functionName).toBe("initialize");
    expect(decoded.args).toEqual([[{ account: admin, roleBitmap: 1n | (1n << 128n) }]]);
    expect((providerRoles.registrar | providerRoles.registrarAdmin) & providerRoles.name).toBe(0n);
  });
});

import { matchesRuntime } from "./provider-registrar";
describe("restricted registrar runtime verification", () => {
  it("accepts only declared immutable differences and rejects changed executable code", () => {
    expect(matchesRuntime("0xaabbcc", "0xaa00cc", { x: [{ start: 1, length: 1 }] })).toBe(true);
    expect(matchesRuntime("0xffbbcc", "0xaa00cc", { x: [{ start: 1, length: 1 }] })).toBe(false);
    expect(matchesRuntime("0xaabb", "0xaa00cc", {})).toBe(false);
    expect(matchesRuntime("0xaabbcc", "0xaa00cc", { x: [{ start: 1, length: 10 }] })).toBe(false);
  });
});

import { sharedSetterPlan } from "./provider-shared";
import type { PublicClient } from "viem";
describe("shared provider delegate boundaries", () => {
  const address = "0x0000000000000000000000000000000000000001";
  it("rejects delegates with broad root privileges before generating transactions", async () => {
    const client = { readContract: async () => true } as unknown as PublicClient;
    await expect(sharedSetterPlan(client, address, address, address, ["description"], "p.eth", 1n)).rejects.toThrow("broad");
  });
  it("prepares only the specified key grants", async () => {
    const client = { readContract: async () => false } as unknown as PublicClient;
    const transactions = await sharedSetterPlan(client, address, address, address, ["description"], "p.eth", 1n);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.description).toContain("description writer across this provider");
  });
});
