import { beforeEach, expect, it, vi } from "vitest";
import { keccak256, zeroAddress } from "viem";
const { client } = vi.hoisted(() => ({
  client: {
    getBlock: vi.fn(),
    getChainId: vi.fn(),
    getCode: vi.fn(),
    readContract: vi.fn(),
    simulateContract: vi.fn(),
    call: vi.fn(),
    getTransaction: vi.fn(),
    getTransactionReceipt: vi.fn(),
  },
}));
vi.mock("@ens402/server", () => ({ ensClient: () => client }));
vi.mock("@ens402/sdk/ens", async (original) => {
  const actual = await original<typeof import("@ens402/sdk/ens")>();
  return {
    ...actual,
    currentDeployment: {
      ...actual.currentDeployment,
      factoryCodeHash: keccak256("0x6000"),
    },
  };
});
import { planPlatform } from "../src/server/platform-plan";
import { currentDeployment } from "@ens402/sdk/ens";
const owner = "0x1111111111111111111111111111111111111111",
  registry = "0x2222222222222222222222222222222222222222",
  ethRegistry = "0x3333333333333333333333333333333333333333";
const input = { parent: "ens402.eth", owner, salt: "123" };
let linked = zeroAddress as string;
beforeEach(() => {
  vi.clearAllMocks();
  linked = zeroAddress;
  client.getBlock.mockResolvedValue({ number: 100n, timestamp: 1000n });
  client.getChainId.mockResolvedValue(11155111);
  client.getCode.mockResolvedValue("0x6000");
  client.simulateContract.mockResolvedValue({ result: registry });
  client.readContract.mockImplementation(async ({ functionName, args }) => {
    if (functionName === "findExpiry") return 9000000n;
    if (functionName === "findOwner") return owner;
    if (functionName === "getSubregistry")
      return args[0] === "eth" ? ethRegistry : linked;
    if (functionName === "verifyContract")
      return currentDeployment.registryImplementation;
    if (functionName === "hasRootRoles") return true;
  });
});
it("prepares only native creation and bounds the recommended provider expiry", async () => {
  const p = await planPlatform(input);
  expect(p.stage).toBe("deploy");
  expect(p.transactions).toHaveLength(1);
  expect(p.setup.registry).toBe(registry);
  expect(p.expiry).toBe(String(1000 + 2592000));
});
it("refuses a connected wallet that is not current name owner", async () => {
  await expect(planPlatform({ ...input, owner: registry })).rejects.toThrow(
    "current platform name owner",
  );
  expect(client.simulateContract).not.toHaveBeenCalled();
});
it("never replaces a nonzero namespace pointer", async () => {
  linked = registry;
  await expect(planPlatform({ ...input, registry: owner })).rejects.toThrow(
    "refusing replacement",
  );
  expect(client.simulateContract).not.toHaveBeenCalled();
});
it("resumes an already attached native registry after checking owner governance", async () => {
  linked = registry;
  const result = await planPlatform(input);
  expect(result.ready).toBe(true);
  expect(result.transactions).toEqual([]);
  expect(client.simulateContract).not.toHaveBeenCalled();
});
it("rejects factory code drift before preparing a transaction", async () => {
  client.getCode.mockResolvedValue("0x6001");
  await expect(planPlatform(input)).rejects.toThrow("pin changed");
  expect(client.simulateContract).not.toHaveBeenCalled();
});
it("rejects failed receipts before linking a registry", async () => {
  client.getTransactionReceipt.mockResolvedValue({
    status: "reverted",
    blockNumber: 99n,
    blockHash: "0x11",
  });
  client.getTransaction.mockResolvedValue({});
  await expect(
    planPlatform({ ...input, deploymentHash: `0x${"11".repeat(32)}` }),
  ).rejects.toThrow("Receipt does not match");
  expect(client.call).not.toHaveBeenCalled();
});
