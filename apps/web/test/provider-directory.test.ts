import { beforeEach, expect, it, vi } from "vitest";
const { client } = vi.hoisted(() => ({ client: { getBlock: vi.fn(), getCode: vi.fn(), getLogs: vi.fn(), readContract: vi.fn() } }));
vi.mock("@ens402/server", () => ({ ensClient: () => client }));
import { providerDirectory } from "../src/server/provider-directory";
import { currentDeployment } from "@ens402/sdk/ens";
const owner = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const registry = "0x3333333333333333333333333333333333333333";
const zero = "0x0000000000000000000000000000000000000000";
beforeEach(() => {
  vi.clearAllMocks();
  client.getBlock.mockResolvedValue({ number: 100n, timestamp: 1000n });
  client.getCode.mockImplementation(async ({ blockNumber }) => blockNumber >= 90n ? "0x01" : "0x");
  client.getLogs.mockImplementation(async ({ event }) => event.name === "ProxyDeployed"
    ? [{ blockNumber: 90n, args: { implementation: currentDeployment.registryImplementation } }]
    : [{ args: { label: "demo" } }]);
  client.readContract.mockImplementation(async ({ functionName, args }) => {
    if (functionName === "findOwner") return owner;
    if (functionName === "findExpiry") return 2000n;
    if (functionName === "getSubregistry") return registry;
    if (functionName === "verifyContract") return currentDeployment.registryImplementation;
    if (functionName === "hasRootRoles") return args[1] === other;
    throw Error("Unexpected read");
  });
});
it("finds an owned provider without a catalog or browser hints", async () => {
  const result = await providerDirectory(owner);
  expect(result.providers).toEqual([{ name: "demo.ens402.eth", owner, registry, role: "Provider owner", serviceNames: ["demo.demo.ens402.eth"], servicesUnavailable: false }]);
  expect(client.getLogs).toHaveBeenCalledWith(expect.objectContaining({ address: registry, fromBlock: 90n, toBlock: 100n }));
  expect(client.getCode).not.toHaveBeenCalled();
});
it("includes delegated registry publishers", async () => {
  expect((await providerDirectory(other)).providers[0]?.role).toBe("Service registrar");
});
it("does not infer current ownership from a historical registration", async () => {
  expect((await providerDirectory("0x4444444444444444444444444444444444444444")).providers).toEqual([]);
});
it("returns setup state when the platform has no child registry", async () => {
  client.readContract.mockImplementation(async ({ functionName }) => functionName === "findOwner" ? owner : functionName === "findExpiry" ? 2000n : zero);
  expect((await providerDirectory(owner)).platformReady).toBe(false);
  expect(client.getLogs).not.toHaveBeenCalled();
});
it("propagates RPC failures instead of reporting no providers", async () => {
  client.getLogs.mockRejectedValue(new Error("RPC unavailable"));
  await expect(providerDirectory(owner)).rejects.toThrow("RPC unavailable");
});
it("rejects invalid wallets before RPC", async () => {
  await expect(providerDirectory("invalid")).rejects.toThrow("valid wallet");
  expect(client.getBlock).not.toHaveBeenCalled();
});
it("excludes expired providers", async () => {
  const implementation = client.readContract.getMockImplementation()!;
  client.readContract.mockImplementation(async input => input.functionName === "findExpiry" && input.args[0] === "demo" ? 900n : implementation(input));
  expect((await providerDirectory(owner)).providers).toEqual([]);
});

it("works with a pruned RPC that rejects every historical code request", async () => {
  client.getCode.mockRejectedValue(new Error("historical state is not available"));
  expect((await providerDirectory(owner)).providers[0]?.name).toBe("demo.ens402.eth");
  expect(client.getCode).not.toHaveBeenCalled();
});
it("does not present an empty directory when deployment provenance is missing", async () => {
  vi.resetModules();
  const { providerDirectory: coldDirectory } = await import("../src/server/provider-directory");
  client.getLogs.mockResolvedValue([]);
  await expect(coldDirectory(owner)).rejects.toThrow("deployment was not found");
});

it("keeps workspace access when listing its services fails", async () => {
  let registrations = 0;
  client.getLogs.mockImplementation(async ({ event }) => {
    if (event.name === "ProxyDeployed") return [{ blockNumber: 90n, args: { implementation: currentDeployment.registryImplementation } }];
    if (++registrations > 1) throw Error("Service logs unavailable");
    return [{ args: { label: "demo" } }];
  });
  const result = await providerDirectory(owner);
  expect(result.providers[0]).toMatchObject({ name: "demo.ens402.eth", servicesUnavailable: true, serviceNames: [] });
});
it("omits expired services while keeping the provider", async () => {
  let registrations = 0;
  client.getLogs.mockImplementation(async ({ event }) => event.name === "ProxyDeployed"
    ? [{ blockNumber: 90n, args: { implementation: currentDeployment.registryImplementation } }]
    : [{ args: { label: ++registrations === 1 ? "demo" : "expired-service" } }]);
  const original = client.readContract.getMockImplementation()!;
  client.readContract.mockImplementation(async input => input.functionName === "findExpiry" && input.args[0] === "expired-service" ? 900n : original(input));
  expect((await providerDirectory(owner)).providers[0]?.serviceNames).toEqual([]);
});
it("exposes actual registration hashes from chain events for explorer links", async () => {
  const hash = `0x${"ab".repeat(32)}`;
  client.getLogs.mockImplementation(async ({ event }) => event.name === "ProxyDeployed"
    ? [{ blockNumber: 90n, args: { implementation: currentDeployment.registryImplementation } }]
    : [{ transactionHash: hash, args: { label: "demo" } }]);
  const result = await providerDirectory(owner);
  expect(result.providers[0]?.registrationTransaction).toBe(hash);
  expect(result.providers[0]?.serviceTransactions?.["demo.demo.ens402.eth"]).toBe(hash);
});
