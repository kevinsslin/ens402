import { keccak256, stringToHex } from "viem";
import { parseCallMetadata, type CallMetadata } from "./call";
import type { ServiceSnapshot } from "./index";
import type { PaymentRequired } from "@x402/core/types";
/** Application extension, not an official x402/Bazaar standard. */
export const SERVICE_METADATA_EXTENSION = "ens402.service";
export type VerifiedMetadata = {
  description: string;
  call: CallMetadata & { verification: "ens402.service.v1" };
  hash: string;
};
function sorted(value: unknown, depth = 0): unknown {
  if (depth > 16) throw new Error("Metadata nesting exceeds supported depth");
  if (Array.isArray(value)) return value.map((item) => sorted(item, depth + 1));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => {
          if (key === "$ref")
            throw new Error(
              "External or recursive schema references are unsupported",
            );
          return [key, sorted(item, depth + 1)];
        }),
    );
  if (value !== null && !["string", "number", "boolean"].includes(typeof value))
    throw new Error("Unsupported metadata value");
  return value;
}
export function canonicalMetadata(
  description: string,
  call: CallMetadata,
): VerifiedMetadata {
  if (
    typeof description !== "string" ||
    !description.trim() ||
    new TextEncoder().encode(description).length > 1024
  )
    throw new Error(
      "Supported service description required (1 to 1024 UTF-8 bytes)",
    );
  const parsed = parseCallMetadata(JSON.stringify(call));
  if (
    parsed.verification !== "ens402.service.v1" ||
    !parsed.inputSchema ||
    !parsed.outputSchema
  )
    throw new Error("Verified metadata requires input and output schemas");
  const normalized = {
    description: description.trim(),
    call: sorted(parsed) as VerifiedMetadata["call"],
  };
  return {
    ...normalized,
    hash: keccak256(stringToHex(JSON.stringify(sorted(normalized)))),
  };
}
export function parseChallengeMetadata(
  challenge: PaymentRequired,
): VerifiedMetadata {
  const extension = challenge.extensions?.[SERVICE_METADATA_EXTENSION] as
    | { version?: number; call?: CallMetadata }
    | undefined;
  if (!extension || extension.version !== 1 || !extension.call)
    throw new Error(
      "Endpoint metadata is missing or unsupported; cannot verify publication",
    );
  return canonicalMetadata(
    challenge.resource.description ?? "",
    extension.call,
  );
}
/** Legacy records are explicitly unverified. New publication opts in and cannot silently downgrade an approved hash. */
export function verifyChallengeMetadata(
  service: Pick<ServiceSnapshot, "description" | "call">,
  challenge: PaymentRequired,
  method: string,
  approvedHash?: string,
): { status: "verified" | "legacy-unverified"; hash?: string } {
  if (!service.call?.verification) {
    if (approvedHash)
      throw new Error("Previously approved metadata verification was removed");
    return { status: "legacy-unverified" };
  }
  const expected = canonicalMetadata(service.description ?? "", service.call);
  const offered = parseChallengeMetadata(challenge);
  if (
    method !== expected.call.method ||
    expected.hash !== offered.hash ||
    (approvedHash !== undefined && approvedHash !== expected.hash)
  )
    throw new Error(
      "HTTP 402 service metadata does not match ENS or buyer approval",
    );
  return { status: "verified", hash: expected.hash };
}
export function metadataExtension(description: string, call: CallMetadata) {
  const metadata = canonicalMetadata(description, call);
  return { [SERVICE_METADATA_EXTENSION]: { version: 1, call: metadata.call } };
}
