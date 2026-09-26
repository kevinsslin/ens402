import { expect, it, vi } from "vitest";
import { editableProviderSetup } from "../src/components/provider-recovery";
import { prepareSetupStep } from "../src/server/setup-transaction";
import { runSetupSequence } from "../src/components/setup-flow";
const setup = { parent: "ens402.eth", label: "demo", admin: "0x1", ops: "0x1", treasury: "0x1", platformSigner: "0x2", salt: "1", registry: "0x3", expiry: "99", resolverSalt: "2" };
it("allows correcting unsigned details without keeping old address predictions", () => {
  expect(editableProviderSetup(setup, false)).toEqual({ ...setup, registry: undefined, expiry: undefined, resolverSalt: undefined });
});
it("preserves confirmed progress even when a later plan refresh fails", () => {
  const confirmed = { ...setup, confirmedSetup: true };
  expect(editableProviderSetup(confirmed, false)).toEqual(confirmed);
  expect(editableProviderSetup(setup, true)).toEqual(setup);
});
it("keeps resolver and registrar addresses for resumed setups", () => {
  const deployed = { ...setup, resolver: "0x4", registrar: "0x5" };
  expect(editableProviderSetup(deployed, false)).toEqual(deployed);
});
it("rejects insufficient gas funds before submitting to the wallet", async () => {
  const submit = vi.fn();
  const step = { signer: "0x1111111111111111111111111111111111111111", data: "0x", description: "Create provider registry", value: "10" };
  const client = { estimateGas: vi.fn().mockResolvedValue(100n), getBalance: vi.fn().mockResolvedValue(249n), estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: 2n }) };
  await expect(runSetupSequence({ setup, active: () => true, plan: async () => {
    const prepared = await prepareSetupStep(step, client as never);
    return { setup, ready: false, transactions: [prepared] };
  }, submit, confirm: vi.fn() })).rejects.toThrow("Insufficient Sepolia ETH");
  expect(submit).not.toHaveBeenCalled();
});
it("permits exact funding including transaction value and padded gas", async () => {
  const client = { estimateGas: vi.fn().mockResolvedValue(100n), getBalance: vi.fn().mockResolvedValue(250n), estimateFeesPerGas: vi.fn().mockResolvedValue({ maxFeePerGas: 2n }) };
  expect((await prepareSetupStep({ signer: setup.admin, data: "0x", value: "10", description: "Setup" }, client as never)).gas).toBe("120");
});
it("lets users change delegates before a predicted resolver is deployed", () => {
  const draft = { ...setup, confirmedSetup: true, resolver: "0x4", confirmedResolver: false };
  expect(editableProviderSetup(draft, true)).toEqual({ ...draft, resolver: undefined });
});
