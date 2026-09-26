import { expect, it } from "vitest";
import { configuredResolverPolicy } from "../src/config";
const complete = {
  PROVIDER_ENS_NAME: "dataco.ens402.eth",
  PROVIDER_REGISTRY_ADDRESS: `0x${"1".repeat(40)}`,
  PROVIDER_RESOLVER_ADDRESS: `0x${"2".repeat(40)}`,
};
it("pins the shared provider group only when all fields are configured", () => {
  expect(configuredResolverPolicy(complete).mode).toBe("provider-shared");
  for (const key of Object.keys(complete))
    expect(() => configuredResolverPolicy({ ...complete, [key]: "" })).toThrow(
      "together",
    );
});
it("retains the strict one-bundle compatibility policy when no shared provider is configured", () => {
  expect(configuredResolverPolicy({})).toEqual({ mode: "dedicated" });
});
it("rejects invalid registry/resolver pins", () => {
  expect(() =>
    configuredResolverPolicy({
      ...complete,
      PROVIDER_RESOLVER_ADDRESS: `0x${"0".repeat(40)}`,
    }),
  ).toThrow("Invalid");
  expect(() =>
    configuredResolverPolicy({
      ...complete,
      PROVIDER_REGISTRY_ADDRESS: "not-an-address",
    }),
  ).toThrow("Invalid");
});

import {
  configuredProviderGroups,
  resolverPolicyForService,
} from "../src/config";
it("selects independently configured providers and rejects unknown or conflicting groups", () => {
  const second = {
    providerName: "other.ens402.eth",
    providerRegistry: `0x${"3".repeat(40)}`,
    resolver: `0x${"4".repeat(40)}`,
  };
  const env = { ...complete, PROVIDER_GROUPS_JSON: JSON.stringify([second]) };
  expect(configuredProviderGroups(env)).toHaveLength(2);
  expect(
    resolverPolicyForService("weather.other.ens402.eth", env),
  ).toMatchObject({mode:"namespace",roots:["ens402.eth"]});
  expect(
    resolverPolicyForService("weather.dataco.ens402.eth", env),
  ).toMatchObject({mode:"namespace",roots:["ens402.eth"]});
  expect(() => resolverPolicyForService("weather.unknown.eth", env)).toThrow(
    "outside supported",
  );
  expect(() =>
    configuredProviderGroups({
      ...env,
      PROVIDER_GROUPS_JSON: JSON.stringify([
        { ...second, providerName: complete.PROVIDER_ENS_NAME },
      ]),
    }),
  ).toThrow("Conflicting");
  expect(() =>
    configuredProviderGroups({ PROVIDER_GROUPS_JSON: "[{}]" }),
  ).toThrow("Incomplete");
});

it("accepts newly registered providers in the configured root without manual pins",()=>{
 expect(resolverPolicyForService("bounty-info.ethglobal.ens402.eth",{})).toEqual({mode:"namespace",roots:["ens402.eth"]});
 expect(()=>resolverPolicyForService("bounty-info.evilens402.eth",{})).toThrow();
 expect(()=>resolverPolicyForService("v1.bounty-info.ethglobal.ens402.eth",{})).toThrow();
});
