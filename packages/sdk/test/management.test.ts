import { describe, it, expect } from "vitest";
import { adminAcceptanceMessage } from "../src/ens/management";
const base = {
  outgoing: "0x0000000000000000000000000000000000000001",
  incoming: "0x0000000000000000000000000000000000000002",
  nameRegistry: "0x0000000000000000000000000000000000000003",
  label: "provider",
  nonce: `0x${"11".repeat(32)}`,
  deadline: 1000,
} as const;
describe("native Admin acceptance", () => {
  it("binds each target, identity, name and deadline", () => {
    const original = adminAcceptanceMessage(base);
    for (const changed of [
      { ...base, label: "other" },
      { ...base, deadline: 1001 },
      { ...base, resolver: base.nameRegistry },
      { ...base, incoming: base.nameRegistry },
    ])
      expect(adminAcceptanceMessage(changed)).not.toBe(original);
    expect(original).toContain("Chain: 11155111");
  });
  it("rejects self handover and invalid scope", () => {
    expect(() =>
      adminAcceptanceMessage({ ...base, incoming: base.outgoing }),
    ).toThrow();
    expect(() =>
      adminAcceptanceMessage({ ...base, label: "nested.name" }),
    ).toThrow();
    expect(() => adminAcceptanceMessage({ ...base, nonce: "0x11" })).toThrow();
  });
});
