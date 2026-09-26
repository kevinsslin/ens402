import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { verifyTypedData, type Hex, type Address } from "viem";
import { authorizationTypes } from "@x402/evm";
import {
  NETWORK,
  USDC,
  verifyRequest,
  type ServiceSnapshot,
  type Approval,
} from "../src/index";
import {
  parsePaymentRecord,
  validateDescription,
  validatePicture,
  prepareRecordUpdate,
  prepareTextPermission,
} from "../src/ens";
import { requestNonce, validateResourceRequest } from "../src/request";
import { preparePayment } from "../src/x402";
const account = privateKeyToAccount(`0x${"11".repeat(32)}`),
  payTo = "0x2222222222222222222222222222222222222222";
const now = Math.floor(Date.now() / 1000),
  endpoint = "https://merchant.example/api/merchant/register";
const payment = {
  version: 2 as const,
  scheme: "exact" as const,
  network: NETWORK,
  asset: USDC,
  payTo,
  pricing: {
    model: "fixed" as const,
    amount: "10000",
    unit: "request" as const,
  },
};
const service: ServiceSnapshot = {
  name: "buy.example.eth",
  authority: "test",
  block: "123",
  endpoint,
  status: "active",
  observedAt: now,
  payment,
};
const approval: Approval = {
  name: service.name,
  authority: service.authority,
  endpoints: [endpoint],
  payTo,
  maxAmount: "50000",
  fixedPrice: "10000",
  expiresAt: now + 600,
};
const requirement = {
  scheme: "exact",
  network: NETWORK,
  asset: USDC,
  payTo,
  amount: "10000",
  maxTimeoutSeconds: 60,
  extra: { name: "USDC", version: "2", ens402RequestBinding: "v1" },
};
it("accepts only the published fixed price even below the buyer cap", () => {
  expect(
    verifyRequest(service, endpoint, requirement, approval, now).outcome,
  ).toBe("continue");
  for (const amount of ["9999", "20000"])
    expect(
      verifyRequest(
        service,
        endpoint,
        { ...requirement, amount },
        approval,
        now,
      ).outcome,
    ).toBe("reject");
});
it("requires renewed consent for price change or downgrade to legacy schema", () => {
  expect(
    verifyRequest(
      {
        ...service,
        payment: {
          ...payment,
          pricing: { ...payment.pricing, amount: "20000" },
        },
      },
      endpoint,
      { ...requirement, amount: "20000" },
      approval,
      now,
    ).outcome,
  ).toBe("hold");
  const { pricing, ...legacy } = payment;
  expect(
    verifyRequest(
      { ...service, payment: { ...legacy, version: 1 } },
      endpoint,
      requirement,
      approval,
      now,
    ).outcome,
  ).toBe("hold");
});
it.each(["0", "-1", "1e4", "001", String(2n ** 256n)])(
  "rejects malformed fixed amount %s",
  (amount) =>
    expect(() =>
      parsePaymentRecord(
        JSON.stringify({ ...payment, pricing: { ...payment.pricing, amount } }),
      ),
    ).toThrow(),
);
it("parses the new schema without dropping its price and rejects ambiguous legacy pricing", () => {
  expect(parsePaymentRecord(JSON.stringify(payment))).toEqual(payment);
  expect(() =>
    parsePaymentRecord(JSON.stringify({ ...payment, version: 1 })),
  ).toThrow("version 2");
});
it("validates metadata and prepares native scoped setters", () => {
  expect(validateDescription(" A search API ")).toBe("A search API");
  expect(() => validateDescription("猫".repeat(400))).toThrow();
  expect(() => validatePicture("javascript:alert(1)")).toThrow();
  expect(() => validatePicture("https://u:p@example.com/a")).toThrow();
  expect(validatePicture("")).toBe("");
  const name = {
    name: service.name,
    resolver: payTo as Address,
    deployment: "current" as const,
  };
  expect(prepareRecordUpdate(name, "description", "Search").data).toMatch(
    /^0x/,
  );
  expect(
    prepareTextPermission(name, "avatar", account.address, true).description,
  ).toContain("dedicated resolver");
});
it("binds the exact order, recipient and endpoint into a real USDC signature", async () => {
  const order = {
    orderId: randomUUID(),
    label: "alice",
    recipient: account.address,
  };
  const request = { method: "POST" as const, body: JSON.stringify(order) };
  const signer = {
    address: account.address,
    signTypedData: vi.fn(account.signTypedData),
  };
  const result = await preparePayment({
    request,
    service,
    requestUrl: endpoint,
    requirement,
    approval,
    signer,
    now: () => now,
    screen: async (address) => ({
      provider: "intercepta",
      network: "ethereum-mainnet",
      address,
      observedAt: now,
      expiresAt: now + 3600,
      cached: false,
      scan: { toxicScore: 0, traits: [] },
    }),
  });
  const payload = result.payload!.payload as {
    signature: Hex;
    authorization: {
      from: Address;
      to: Address;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: Hex;
    };
  };
  expect(payload.authorization.nonce).toBe(requestNonce(endpoint, request));
  expect(
    requestNonce(endpoint, {
      ...request,
      body: JSON.stringify({ ...order, recipient: payTo }),
    }),
  ).not.toBe(payload.authorization.nonce);
  expect(requestNonce(endpoint + "/other", request)).not.toBe(
    payload.authorization.nonce,
  );
  expect(
    await verifyTypedData({
      address: account.address,
      domain: {
        name: "USDC",
        version: "2",
        chainId: 84532,
        verifyingContract: USDC,
      },
      types: authorizationTypes,
      primaryType: "TransferWithAuthorization",
      message: {
        ...payload.authorization,
        value: 10000n,
        validAfter: 0n,
        validBefore: BigInt(payload.authorization.validBefore),
      },
      signature: payload.signature,
    }),
  ).toBe(true);
});
it("rejects unbounded requests and missing unique order IDs", () => {
  expect(() =>
    validateResourceRequest({ method: "POST", body: "{}" }),
  ).toThrow();
  expect(() =>
    validateResourceRequest({ method: "POST", body: "x".repeat(9000) }),
  ).toThrow();
});
