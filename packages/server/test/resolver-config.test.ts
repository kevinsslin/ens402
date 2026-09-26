import { expect, it } from "vitest";
import { configuredResolverPolicy } from "../src/config";
const complete = { PROVIDER_ENS_NAME: "dataco.ens402.eth", PROVIDER_REGISTRY_ADDRESS: `0x${"1".repeat(40)}`, PROVIDER_RESOLVER_ADDRESS: `0x${"2".repeat(40)}` };
it("pins the shared provider group only when all fields are configured", () => {
  expect(configuredResolverPolicy(complete).mode).toBe("provider-shared");
  for (const key of Object.keys(complete)) expect(() => configuredResolverPolicy({ ...complete, [key]: "" })).toThrow("together");
});
it("retains the strict one-bundle compatibility policy when no shared provider is configured", () => {
  expect(configuredResolverPolicy({})).toEqual({ mode: "dedicated" });
});
it("rejects invalid registry/resolver pins", () => {
  expect(() => configuredResolverPolicy({ ...complete, PROVIDER_RESOLVER_ADDRESS: `0x${"0".repeat(40)}` })).toThrow("Invalid");
  expect(() => configuredResolverPolicy({ ...complete, PROVIDER_REGISTRY_ADDRESS: "not-an-address" })).toThrow("Invalid");
});
