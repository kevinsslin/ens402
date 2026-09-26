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
