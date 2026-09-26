import { beforeEach, expect, it, vi } from "vitest";
const { client, inspect, load } = vi.hoisted(() => ({
  client: {
    getBlock: vi.fn(),
    readContract: vi.fn(),
    getCode: vi.fn(),
    simulateContract: vi.fn(),
  },
  inspect: vi.fn(),
  load: vi.fn(),
}));
vi.mock("../../../packages/sdk/src/ens/current", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveCurrentService: inspect,
}));
vi.mock("@ens402/server", () => ({
  ensClient: () => client,
  inspectService: inspect,
}));
vi.mock("@ens402/server/discovery-runtime", () => ({
  configuredDiscovery: () => ({ source: { load } }),
}));
import { planProvider } from "../src/server/provider-plan";
import { merchantDashboard } from "../src/server/merchant-dashboard";
import { currentDeployment } from "../../../packages/sdk/src/ens/current";
const admin = "0x1111111111111111111111111111111111111111",
  registry = "0x2222222222222222222222222222222222222222",
  wallet = "0x3333333333333333333333333333333333333333";
beforeEach(() => {
  vi.clearAllMocks();
  client.getBlock.mockResolvedValue({ number: 100n, timestamp: 1000n });
});
it("rejects a different platform before preparing deployment", async () => {
  await expect(
    planProvider({
      parent: "other.eth",
      label: "demo",
      admin,
      platformSigner: admin,
      ops: wallet,
      treasury: registry,
      salt: "1",
    }),
  ).rejects.toThrow("configured platform");
  expect(client.simulateContract).not.toHaveBeenCalled();
});
it("blocks setup when the platform registry is not initialized", async () => {
  client.readContract.mockImplementation(async ({ functionName }) =>
    functionName === "findExpiry"
      ? 1000000n
      : "0x0000000000000000000000000000000000000000",
  );
  await expect(
    planProvider({
      parent: "ens402.eth",
      label: "demo",
      admin,
      platformSigner: admin,
      ops: wallet,
      treasury: registry,
      salt: "1",
    }),
  ).rejects.toThrow("initialized");
  expect(client.simulateContract).not.toHaveBeenCalled();
});
it("rejects provider names controlled by someone else", async () => {
  client.readContract.mockImplementation(async ({ functionName }) =>
    functionName === "findExpiry"
      ? 1000000n
      : functionName === "getSubregistry"
        ? registry
        : wallet,
  );
  await expect(
    planProvider({
      parent: "ens402.eth",
      label: "demo",
      admin,
      platformSigner: admin,
      ops: wallet,
      treasury: registry,
      salt: "1",
    }),
  ).rejects.toThrow("another wallet");
  expect(client.simulateContract).not.toHaveBeenCalled();
});
it("does not infer merchant control from matching payout addresses", async () => {
  client.readContract.mockImplementation(async ({ functionName }) =>
    functionName === "findOwner"
      ? admin
      : functionName === "getSubregistry"
        ? registry
        : functionName === "verifyContract"
          ? currentDeployment.registryImplementation
          : functionName === "findExpiry"
            ? 1000000n
            : false,
  );
  const service = {
    block: "100",
    name: "weather.demo.ens402.eth",
    parentRegistry: registry,
    resolver: registry,
    owner: admin,
    status: "active",
    endpoint: "https://example.com",
    description: "Weather",
    call: { method: "GET" },
    payment: { version: 2, payTo: wallet, pricing: { amount: "10000" } },
  };
  inspect.mockResolvedValue(service);
  load.mockResolvedValue({
    services: [
      {
        service: {
          ...service,
          payTo: wallet,
          fixture: false,
          indexedAt: 1000,
          expiresAt: 1000000,
          pricePerRequestAtomic: "10000",
        },
      },
    ],
  });
  const result = await merchantDashboard("demo.ens402.eth", wallet);
  expect(result.canPublish).toBe(false);
  expect(result.services[0]).toMatchObject({
    controlled: false,
    broadText: false,
    textAdmin: false,
    state: "listed",
  });
});
it("checks a just-registered name even before catalog ingestion", async () => {
  client.readContract.mockImplementation(async ({ functionName }) =>
    functionName === "findOwner"
      ? admin
      : functionName === "getSubregistry"
        ? registry
        : functionName === "verifyContract"
          ? currentDeployment.registryImplementation
          : functionName === "findExpiry"
            ? 1000000n
            : false,
  );
  load.mockResolvedValue({ services: [] });
  inspect.mockResolvedValue({
    block: "100",
    owner: admin,
    name: "new.demo.ens402.eth",
    parentRegistry: registry,
    resolver: registry,
    status: "active",
    payment: { version: 2, payTo: admin, pricing: { amount: "10000" } },
  });
  expect(
    (await merchantDashboard("demo.ens402.eth", wallet, "new.demo.ens402.eth"))
      .services[0]?.state,
  ).toBe("awaiting-index");
  await expect(
    merchantDashboard("demo.ens402.eth", wallet, "evil.other.eth"),
  ).rejects.toThrow("directly below");
});
