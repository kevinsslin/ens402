import { beforeEach, expect, it, vi } from "vitest";
import { decodeFunctionData, parseAbi } from "viem";
const { readContract, resolve, prepare } = vi.hoisted(() => ({
  readContract: vi.fn(),
  resolve: vi.fn(),
  prepare: vi.fn(async (x) => ({ ...x, gas: "100000" })),
}));
vi.mock("@ens402/server", () => ({
  ensClient: () => ({ getBlock: async () => ({ number: 1n }), readContract }),
}));
vi.mock("../../../packages/sdk/src/ens/current", async (original) => ({
  ...(await original<object>()),
  resolveCurrentService: resolve,
}));
vi.mock("../src/server/setup-transaction", () => ({
  prepareSetupStep: prepare,
}));
import {
  readServiceSettings,
  prepareServiceSettings,
} from "../src/server/service-settings";
import { serviceImage } from "../../../packages/server/src/service-images";
const addr = "0x1111111111111111111111111111111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  readContract.mockImplementation(async (x) =>
    x.functionName === "hasRoles" ? true : addr,
  );
  resolve.mockResolvedValue({
    name: "hello.demo.ens402.eth",
    block: "1",
    resolver: addr,
    owner: addr,
    deployment: "current",
  });
});
it("loads settings without any buyer approval or payment screening", async () => {
  const s = await readServiceSettings("hello.demo.ens402.eth", addr);
  expect(s.permissions).toHaveLength(6);
  expect(resolve).toHaveBeenCalledWith(
    expect.anything(),
    "hello.demo.ens402.eth",
    undefined,
    expect.objectContaining({ mode: "provider-shared", resolver: addr }),
  );
});
it("blocks updates without native write permission before simulation", async () => {
  readContract.mockImplementation(async (x) =>
    x.functionName === "hasRoles" ? false : addr,
  );
  await expect(
    prepareServiceSettings({
      name: "hello.demo.ens402.eth",
      wallet: addr,
      changes: [{ key: "description", value: "test" }],
    }),
  ).rejects.toThrow("cannot update");
  expect(prepare).not.toHaveBeenCalled();
});
it("batches multiple validated settings into one resolver transaction", async () => {
  const tx = await prepareServiceSettings({
    name: "hello.demo.ens402.eth",
    wallet: addr,
    changes: [
      { key: "description", value: "Updated description" },
      { key: "avatar", value: "" },
    ],
  });
  const decoded = decodeFunctionData({
    abi: parseAbi(["function multicall(bytes[] calls) returns(bytes[])"]),
    data: tx.data,
  });
  expect(decoded.args?.[0]).toHaveLength(2);
  expect(tx.signer).toBe(addr);
});
it("rejects duplicate keys and invalid images", async () => {
  await expect(
    prepareServiceSettings({
      name: "hello.demo.ens402.eth",
      wallet: addr,
      changes: [
        { key: "description", value: "a" },
        { key: "description", value: "b" },
      ],
    }),
  ).rejects.toThrow("changed settings");
  expect(() => serviceImage(Buffer.from("<svg/>"))).toThrow("PNG");
  expect(() => serviceImage(new Uint8Array(1048577))).toThrow("1 MB");
});
it("stores raster images by content hash", () => {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  const image = serviceImage(png);
  expect(image.mediaType).toBe("image/png");
  expect(image.id).toMatch(/^[a-f0-9]{64}$/);
  expect(serviceImage(png).id).toBe(image.id);
});
