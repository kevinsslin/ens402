import { expect, it, vi } from "vitest";
import {
  hashMessage,
  decodeFunctionData,
  type Address,
  type PublicClient,
} from "viem";
import {
  NETWORK,
  USDC,
  verifyRequest,
  type ServiceSnapshot,
} from "../src/index";
import {
  parsePaymentRecord,
  prepareRecordUpdate,
  currentResolverAbi,
} from "../src/ens";
import {
  checkNameOwnerRecipient,
  recipientControlMessage,
} from "../src/recipient";
const owner = "0x1111111111111111111111111111111111111111" as Address;
const other = "0x2222222222222222222222222222222222222222" as Address;
const now = 1800000000;
const record = {
  version: 3,
  recipient: "name-owner",
  scheme: "exact",
  network: NETWORK,
  asset: USDC,
  pricing: { model: "fixed", amount: "10000", unit: "request" },
};
const makeService = (): ServiceSnapshot & { owner: Address } => ({
  name: "weather.provider.eth",
  owner,
  endpoint: "https://example.com/weather",
  status: "active",
  block: "100",
  observedAt: now,
  authority: "owner-epoch-1",
  payment: parsePaymentRecord(JSON.stringify(record), owner),
});
function clients(sourceCode = "0x", targetCode = "0x", valid = true) {
  const ens = {
    getChainId: vi.fn(async () => 11155111),
    getCode: vi.fn(async () => sourceCode),
  };
  const payment = {
    getChainId: vi.fn(async () => 84532),
    getCode: vi.fn(async () => targetCode),
    getBlock: vi.fn(async () => ({
      number: 200n,
      hash: `0x${"11".repeat(32)}`,
      timestamp: BigInt(now),
    })),
    readContract: vi.fn(async () => (valid ? "0x1626ba7e" : "0xffffffff")),
  };
  return {
    ens,
    payment,
    run: (s = makeService()) =>
      checkNameOwnerRecipient(
        ens as unknown as PublicClient,
        payment as unknown as PublicClient,
        s,
        now,
      ),
  };
}
it("derives recipients from the live owner and rejects conflicting stored destinations", () => {
  expect(parsePaymentRecord(JSON.stringify(record), owner).payTo).toBe(owner);
  expect(parsePaymentRecord(JSON.stringify(record), other).payTo).toBe(other);
  expect(() => parsePaymentRecord(JSON.stringify(record))).toThrow(
    /live nonzero/,
  );
  expect(() =>
    parsePaymentRecord(JSON.stringify({ ...record, payTo: owner }), owner),
  ).toThrow(/no payTo/);
  expect(() =>
    parsePaymentRecord(
      JSON.stringify({
        ...record,
        controlProof: { validUntil: 0, signature: "0x" },
      }),
      owner,
    ),
  ).toThrow(/proof/);
});
it("writes v3 without accidentally serializing its resolved recipient", () => {
  const tx = prepareRecordUpdate(
    {
      name: "weather.provider.eth",
      resolver: owner,
      owner,
      deployment: "current",
    },
    "ens402.payment",
    JSON.stringify(record),
  );
  const decoded = decodeFunctionData({
    abi: currentResolverAbi,
    data: tx.data,
  });
  expect(decoded.functionName).toBe("setText");
  expect(String(decoded.args?.[2])).not.toContain("payTo");
  expect(JSON.parse(String(decoded.args?.[2]))).toMatchObject({
    recipient: "name-owner",
    version: 3,
  });
});
it("requires both chain observations and rejects an undeployed destination contract wallet", async () => {
  const c = clients();
  const result = await c.run();
  expect(result).toMatchObject({
    method: "eoa-code-check",
    ensBlock: "100",
    paymentBlock: "200",
    address: owner,
  });
  expect(c.ens.getCode).toHaveBeenCalledWith({
    address: owner,
    blockNumber: 100n,
  });
  await expect(clients("0x6000").run()).rejects.toThrow(
    /deployed payment-chain/,
  );
  await expect(clients("0x", "0x6000").run()).rejects.toThrow(/signature/);
  c.payment.getChainId.mockResolvedValue(1);
  await expect(c.run()).rejects.toThrow(/Base Sepolia/);
});
it("verifies contract-holder proof on the destination chain and binds name/chain/owner/expiry", async () => {
  const s = makeService();
  if (s.payment.version !== 3) throw Error();
  s.payment.controlProof = { validUntil: now + 600, signature: "0x1234" };
  const c = clients("0x6000", "0x6000");
  expect((await c.run(s)).method).toBe("destination-signature");
  expect(c.payment.readContract).toHaveBeenCalledWith(
    expect.objectContaining({
      address: owner,
      functionName: "isValidSignature",
      args: [
        hashMessage(recipientControlMessage(s.name, owner, now + 600)),
        "0x1234",
      ],
      blockNumber: 200n,
    }),
  );
  expect(recipientControlMessage(s.name, owner, now + 600)).toContain(
    "Payment network: eip155:84532",
  );
  await expect(clients("0x6000", "0x6000", false).run(s)).rejects.toThrow(
    /invalid/,
  );
  c.payment.readContract.mockRejectedValueOnce(new Error("contract rejected"));
  await expect(c.run(s)).rejects.toThrow(/invalid/);
  s.payment.controlProof.validUntil = now;
  await expect(c.run(s)).rejects.toThrow(/valid destination/);
});
it("holds v3 signing without fresh destination evidence and holds after ownership change", async () => {
  const s = makeService();
  const approval = {
    name: s.name,
    authority: s.authority,
    endpoints: [s.endpoint],
    payTo: owner,
    maxAmount: "10000",
    fixedPrice: "10000",
    expiresAt: now + 600,
  };
  const requirement = {
    scheme: "exact",
    network: NETWORK,
    asset: USDC,
    payTo: owner,
    amount: "10000",
    maxTimeoutSeconds: 60,
    extra: { name: "USDC", version: "2" },
  };
  const check = () => verifyRequest(s, s.endpoint, requirement, approval, now);
  expect(check().outcome).toBe("hold");
  s.recipientCheck = await clients().run(s);
  expect(check().outcome).toBe("continue");
  s.recipientCheck.observedAt = now - 31;
  expect(check().outcome).toBe("hold");
  s.recipientCheck.observedAt = now;
  s.authority = "owner-epoch-2";
  s.payment.payTo = other;
  expect(check().outcome).toBe("hold");
});
