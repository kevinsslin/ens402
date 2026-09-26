import { isAddress, zeroAddress, type Address } from "viem";
import { normalize } from "viem/ens";
import type { CurrentResolverPolicy } from "@ens402/sdk/ens";
import { createHash, timingSafeEqual } from "node:crypto";
import { validAmount } from "@ens402/sdk";

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
export function authorized(
  header: string | null,
  token = process.env.DEMO_ACCESS_TOKEN,
): boolean {
  if (
    !token ||
    token.length < 32 ||
    !header?.startsWith("Bearer ") ||
    header.length > 512
  )
    return false;
  return timingSafeEqual(
    createHash("sha256").update(header.slice(7)).digest(),
    createHash("sha256").update(token).digest(),
  );
}
export function uuid(input: unknown): string {
  if (
    typeof input !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input,
    )
  )
    throw new Error("A UUID idempotency key is required");
  return input;
}
export function amount(input: unknown, ceiling: string): string {
  if (
    typeof input !== "string" ||
    !validAmount(input) ||
    BigInt(input) <= 0n ||
    BigInt(input) > BigInt(ceiling)
  )
    throw new Error("Amount is outside the demo limits");
  return input;
}
export function allowedOrigins(): string[] {
  return requireEnv("MERCHANT_ALLOWED_ORIGINS")
    .split(",")
    .map((value) => {
      const url = new URL(value.trim());
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error("Merchant allowlist must contain HTTPS origins only");
      return url.origin;
    });
}
export function allowedNames(): string[] {
  return requireEnv("SERVICE_ENS_NAME")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
export function readiness() {
  const names = [
    "DATABASE_URL",
    "PRIVY_APP_ID",
    "PRIVY_APP_SECRET",
    "INTERCEPTA_API_KEY",
    "SEPOLIA_RPC_URL",
    "BASE_SEPOLIA_RPC_URL",
  ] as const;
  return {
    configured: names.map((name) => ({
      name,
      configured: !!process.env[name]?.trim(),
    })),
    registrationConfigured: [
      "ENS_PARENT_NAME",
      "ENS_PURCHASE_REGISTRY",
      "ENS_PURCHASE_EXPIRY",
      "ENS_REGISTRATION_PRIVATE_KEY",
      "ENS_REGISTRATION_RESOURCE_URL",
      "MERCHANT_PAY_TO",
    ].every((name) => !!process.env[name]?.trim()),
    signer: "Privy",
    ensChain: "Sepolia",
    paymentChain: "Base Sepolia",
    constraints: [
      "Native ENS roles control records",
      "Backend reserves daily budget",
      "Privy restricts each authorization",
      "No automatic retry after uncertain submission",
    ],
  };
}

/** Provider pins are operator configuration, never inferred from untrusted service metadata. */
export function configuredResolverPolicy(
  env: Record<string, string | undefined> = process.env,
): CurrentResolverPolicy {
  const fields = [
    env.PROVIDER_ENS_NAME,
    env.PROVIDER_REGISTRY_ADDRESS,
    env.PROVIDER_RESOLVER_ADDRESS,
  ].map((value) => value?.trim());
  const present = fields.filter(Boolean).length;
  if (present === 0) return { mode: "dedicated" }; // Compatibility for existing dedicated deployments.
  if (present !== 3)
    throw new Error("Configure provider name, registry and resolver together");
  const [name, registry, resolver] = fields as [string, string, string];
  const providerName = normalize(name);
  if (
    !providerName.endsWith(".eth") ||
    providerName.split(".").length < 3 ||
    !isAddress(registry) ||
    !isAddress(resolver) ||
    registry.toLowerCase() === zeroAddress ||
    resolver.toLowerCase() === zeroAddress
  )
    throw new Error("Invalid provider resolver configuration");
  return {
    mode: "provider-shared",
    providerName,
    providerRegistry: registry as Address,
    resolver: resolver as Address,
  };
}

/** Explicit operator pins for additional providers. Catalog metadata cannot expand this trust set. */
export function configuredProviderGroups(
  env: Record<string, string | undefined> = process.env,
): Extract<CurrentResolverPolicy, { mode: "provider-shared" }>[] {
  const primary = configuredResolverPolicy(env);
  const groups = primary.mode === "provider-shared" ? [primary] : [];
  if (env.PROVIDER_GROUPS_JSON?.trim()) {
    const entries: unknown = JSON.parse(env.PROVIDER_GROUPS_JSON);
    if (!Array.isArray(entries) || entries.length > 100)
      throw Error("Provider groups must be an array of at most 100 pins");
    for (const entry of entries) {
      if (!entry || typeof entry !== "object")
        throw Error("Invalid provider group");
      const e = entry as Record<string, string>;
      const policy = configuredResolverPolicy({
        PROVIDER_ENS_NAME: e.providerName,
        PROVIDER_REGISTRY_ADDRESS: e.providerRegistry,
        PROVIDER_RESOLVER_ADDRESS: e.resolver,
      });
      if (policy.mode !== "provider-shared")
        throw Error("Incomplete provider group");
      const prior = groups.find(
        (group) => group.providerName === policy.providerName,
      );
      if (
        prior &&
        (prior.providerRegistry.toLowerCase() !==
          policy.providerRegistry.toLowerCase() ||
          prior.resolver.toLowerCase() !== policy.resolver.toLowerCase())
      )
        throw Error("Conflicting provider pins");
      if (!prior) groups.push(policy);
    }
  }
  return groups;
}
export function resolverPolicyForService(
  name: string,
  env: Record<string, string | undefined> = process.env,
): CurrentResolverPolicy {
  const provider = normalize(name).split(".").slice(1).join(".");
  const groups = configuredProviderGroups(env);
  const group = groups.find((group) => group.providerName === provider);
  if (group) return group;
  if (groups.length)
    throw Error(
      "Configure this provider's registry and resolver before hosted verification",
    );
  return { mode: "dedicated" };
}
