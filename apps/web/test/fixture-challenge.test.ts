import { afterEach, expect, it, vi } from "vitest";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { GET } from "../src/app/api/merchant/fixtures/[service]/route";
afterEach(() => vi.unstubAllEnvs());
it.each(["weather", "fx", "research", "bounty-info"])("%s issues actual x402 challenge without delivering data", async service => {
  vi.stubEnv("MERCHANT_RESOURCE_URL", "https://example.com/api/merchant/search");
  vi.stubEnv("MERCHANT_PAY_TO", "0x0000000000000000000000000000000000001234");
  vi.stubEnv("MERCHANT_PRICE_UNITS", "10000");
  const response = await GET(new Request(`https://example.com/api/merchant/fixtures/${service}`), { params: Promise.resolve({ service }) });
  expect(response.status).toBe(402);
  const challenge = decodePaymentRequiredHeader(response.headers.get("PAYMENT-REQUIRED")!);
  expect(challenge.resource?.url).toBe(`https://example.com/api/merchant/fixtures/${service}`);
  expect(challenge.resource?.description).toContain("Demo fixture");
  expect(challenge.accepts[0]?.amount).toBe("10000");
  expect(challenge.accepts[0]?.network).toBe("eip155:84532");
  expect(await response.json()).not.toHaveProperty("data");
});

it("bounty onboarding uses exactly the metadata served by its endpoint", async () => {
  vi.stubEnv("MERCHANT_RESOURCE_URL", "https://example.com/api/merchant/search");
  vi.stubEnv("MERCHANT_PAY_TO", "0x0000000000000000000000000000000000001234");
  vi.stubEnv("MERCHANT_PRICE_UNITS", "10000");
  const { GET: demos } = await import("../src/app/api/merchant/demo-services/route");
  const { services } = await demos().json();
  const demo = services.find((entry: { id: string }) => entry.id === "bounty-info");
  expect(demo).toBeDefined();
  const response = await GET(new Request(demo.endpoint), { params: Promise.resolve({ service: demo.id }) });
  const challenge = decodePaymentRequiredHeader(response.headers.get("PAYMENT-REQUIRED")!);
  const { parseChallengeMetadata, canonicalMetadata } = await import("@ens402/sdk/metadata");
  expect(parseChallengeMetadata(challenge).hash).toBe(canonicalMetadata(demo.description, demo.call).hash);
  expect(demo.call.outputExample).toMatchObject({ fixture: true, liveData: false, service: "bounty-info" });
  expect(demo.call.outputExample.bounties).toHaveLength(2);
  expect(demo.description).toContain("ETHGlobal bounty information");
  expect(demo.call.outputExample.notice).toContain("not official offers");
});
