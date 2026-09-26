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
import { DiscoveryNotReadyError } from "@ens402/server/discovery";
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
    call: { method: "GET", fixture: true },
    payment: { version: 2, payTo: wallet, pricing: { amount: "10000" } },
  };
  inspect.mockResolvedValue(service);
  load.mockResolvedValue({
    services: [
      {
        service: {
          ...service,
          payTo: wallet,
          fixture: true,
          indexedBlock: "100",
          call: { fixture: true, method: "GET" },
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
  load.mockRejectedValueOnce(new DiscoveryNotReadyError());
  const firstSync = await merchantDashboard("demo.ens402.eth", wallet, "new.demo.ens402.eth");
  expect(firstSync.services[0]?.state).toBe("awaiting-index");
  expect(firstSync.indexError).toContain("first search sync");
  load.mockRejectedValueOnce(new Error("Database unavailable"));
  expect((await merchantDashboard("demo.ens402.eth", wallet, "new.demo.ens402.eth")).services[0]?.state).toBe("index-error");
  await expect(
    merchantDashboard("demo.ens402.eth", wallet, "evil.other.eth"),
  ).rejects.toThrow("directly below");
});
it("uses a distinct deterministic resolver salt when resuming a deployed provider registry", async () => {
  client.readContract.mockImplementation(async ({ functionName }) => {
    if (functionName === "findExpiry") return 1000000n;
    if (functionName === "findOwner") return admin;
    if (functionName === "getSubregistry") return registry;
    if (functionName === "verifyContract") return currentDeployment.registryImplementation;
    if (functionName === "hasRootRoles") return true;
    throw Error("Unexpected read");
  });
  client.getCode.mockResolvedValue("0x6000");
  client.simulateContract.mockImplementation(async ({ args }) => {
    if (args[1] === 123n) throw Error("Registry already occupies this factory salt");
    return { result: "0x4444444444444444444444444444444444444444" };
  });
  const input = { parent: "ens402.eth", label: "demo", admin, platformSigner: admin, ops: wallet, treasury: registry, salt: "123" };
  const plan = await planProvider(input);
  expect(plan.setup.resolverSalt).not.toBe("123");
  expect(plan.setup.registry).toBe(registry);
  expect(plan.transactions[0]?.description).toContain("Deploy shared");
  client.getCode.mockImplementation(async ({ address }) => address === registry ? "0x6000" : "0x");
  const resumed = await planProvider(plan.setup);
  expect(resumed.setup.resolverSalt).toBe(plan.setup.resolverSalt);
  expect(resumed.setup.resolver).toBe(plan.setup.resolver);
});
it("rejects an explicitly reused resolver salt before RPC calls", async () => {
  await expect(planProvider({ parent: "ens402.eth", label: "demo", admin, platformSigner: admin, ops: wallet, treasury: registry, salt: "123", resolverSalt: "123" })).rejects.toThrow("distinct");
});
