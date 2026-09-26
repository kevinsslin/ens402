import { expect, it, vi } from "vitest";
const { client, shared } = vi.hoisted(() => ({
  client: { getBlock: vi.fn(), readContract: vi.fn(), simulateContract: vi.fn() },
  shared: vi.fn(),
}));
vi.mock("@ens402/server", () => ({ ensClient: () => client }));
vi.mock("../../../scripts/ens/provider-shared", () => ({ sharedResolverPlan: shared }));
import { planProvider } from "../src/server/provider-plan";
import { zeroAddress } from "viem";
it("detects a later resolver conflict before returning the first registry transaction", async () => {
  const admin = "0x1111111111111111111111111111111111111111";
  client.getBlock.mockResolvedValue({ number: 100n, timestamp: 100000n });
  client.readContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
    if (functionName === "findExpiry") return 10000000n;
    if (functionName === "getSubregistry") return admin;
    if (functionName === "findOwner") return zeroAddress;
    if (functionName === "hasRootRoles") return true;
    throw Error(functionName);
  });
  client.simulateContract.mockResolvedValue({ result: admin });
  shared.mockRejectedValue(Error("Shared resolver delegate unexpectedly has text administration"));
  await expect(planProvider({ parent: "ens402.eth", label: "demo", admin, platformSigner: admin, ops: admin, treasury: admin, salt: "1" })).rejects.toThrow("text administration");
  expect(shared).toHaveBeenCalledOnce();
});
