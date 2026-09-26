import { beforeEach, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { authorizationTypes } from "@x402/evm";
import { NETWORK, USDC } from "@ens402/sdk";
const mock = vi.hoisted(() => ({ getExecution: vi.fn(), getApproval: vi.fn(), finish: vi.fn(), beforeSubmit: vi.fn(), inspect: vi.fn(), screen: vi.fn() }));
vi.mock("../src/index", () => ({ getStore: () => mock, inspectService: mock.inspect, screenRecipient: mock.screen, baseClient: vi.fn() }));
vi.mock("../src/transport", () => ({ createResourceTransport: () => vi.fn() }));
import { submitExternal } from "../src/external";
const id = "f836490b-823a-4869-bbd0-17cf53e82efa";
const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const payTo = `0x${"2".repeat(40)}` as const;
beforeEach(() => {
  vi.resetAllMocks();
  mock.finish.mockImplementation(async (_id, receipt) => ({ id, state: receipt.state, receipt }));
  mock.getApproval.mockResolvedValue({ mode: "self", payer: account.address, approval: { name: "hello.demo.ens402.eth" } });
});
it("closes an expired reservation instead of leaving it to block other purchases", async () => {
  const message = { from: account.address, to: payTo, value: "10000", validAfter: "0", validBefore: String(Math.floor(Date.now() / 1000) - 5), nonce: `0x${"ab".repeat(32)}` };
  const typedData = { domain: { name: "USDC", version: "2", chainId: 84532, verifyingContract: USDC }, types: authorizationTypes, primaryType: "TransferWithAuthorization", message } as const;
  const signature = await account.signTypedData({ ...typedData, message: { ...message, nonce: message.nonce as `0x${string}`, value: 10000n, validAfter: 0n, validBefore: BigInt(message.validBefore) } });
  const requirement = { scheme: "exact", network: NETWORK, asset: USDC, payTo, amount: "10000", maxTimeoutSeconds: 60, extra: { name: "USDC", version: "2" } };
  mock.getExecution.mockResolvedValue({ id, state: "reserved", approval_id: id, prepared: { typedData, receipt: { state: "held", reason: "Awaiting your wallet signature", steps: [], requirement, authorization: message } } });
  await expect(submitExternal({ id, signature }, async () => {})).resolves.toMatchObject({ state: "held", receipt: { reason: expect.stringContaining("no payment was sent") } });
  expect(mock.inspect).not.toHaveBeenCalled();
  expect(mock.beforeSubmit).not.toHaveBeenCalled();
});
