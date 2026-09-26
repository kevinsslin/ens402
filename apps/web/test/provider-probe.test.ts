import { beforeEach, expect, it, vi } from "vitest";
import { encodePaymentRequiredHeader } from "@x402/core/http";
const { auth, rate, fetchResource } = vi.hoisted(() => ({
  auth: vi.fn(),
  rate: vi.fn(),
  fetchResource: vi.fn(),
}));
vi.mock("@ens402/server/platform", () => ({ authenticate: auth }));
vi.mock("@ens402/server", () => ({ getStore: () => ({ rateLimit: rate }) }));
vi.mock("@ens402/server/transport", () => ({
  createResourceTransport: () => fetchResource,
}));
import { POST } from "../src/app/api/provider/probe/route";
const recipient = "0x1111111111111111111111111111111111111111",
  endpoint = "https://merchant.example/api";
const input = {
  endpoint,
  price: "10000",
  payTo: recipient,
  callConfig: JSON.stringify({ method: "GET" }),
};
function request(value = input) {
  return new Request("https://ens402.example/api/provider/probe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test",
    },
    body: JSON.stringify(value),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ kind: "user", ownerId: "human" });
});
function challenge(payTo = recipient) {
  return new Response(null, {
    status: 402,
    headers: {
      "PAYMENT-REQUIRED": encodePaymentRequiredHeader({
        x402Version: 2,
        resource: {
          url: endpoint,
          description: "API",
          mimeType: "application/json",
        },
        accepts: [
          {
            scheme: "exact",
            network: "eip155:84532",
            asset: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
            payTo,
            amount: "10000",
            maxTimeoutSeconds: 60,
            extra: { name: "USDC", version: "2" },
          },
        ],
      }),
    },
  });
}
it("checks matching owner/atomic price without signatures or settlement", async () => {
  fetchResource.mockResolvedValue(challenge());
  expect((await POST(request())).status).toBe(200);
  expect(rate).toHaveBeenCalledWith("human");
  expect(fetchResource.mock.calls[0]?.[1].headers).toEqual({});
  expect(fetchResource.mock.calls[0]?.[1].redirect).toBe("error");
});
it("rejects a different recipient before registration", async () => {
  fetchResource.mockResolvedValue(
    challenge("0x2222222222222222222222222222222222222222"),
  );
  expect((await POST(request())).status).toBe(400);
});
it("requires human authentication before contacting a merchant", async () => {
  auth.mockResolvedValue({ kind: "agent", ownerId: "agent" });
  expect((await POST(request())).status).toBe(401);
  expect(fetchResource).not.toHaveBeenCalled();
});
it("requires explicit POST request binding", async () => {
  fetchResource.mockResolvedValue(challenge());
  expect(
    (
      await POST(
        request({
          ...input,
          callConfig: JSON.stringify({
            method: "POST",
            example: { city: "Tokyo" },
          }),
        }),
      )
    ).status,
  ).toBe(400);
  expect(JSON.parse(fetchResource.mock.calls[0]?.[1].body).orderId).toMatch(
    /^[0-9a-f-]{36}$/,
  );
});
