import { zeroAddress, type Address } from "viem";
import { normalize } from "viem/ens";
import { sameAddress } from "../index";

/** Shared means a configured provider permission boundary, not a globally trusted resolver. */
export type CurrentResolverPolicy =
  | { mode: "dedicated" }
  | {
      mode: "provider-shared";
      providerName: string;
      providerRegistry: Address;
      resolver: Address;
    };

/**
 * Check the exact-name link and the caller's intended permission group.
 * A record count cannot enumerate aliases or prove exclusive control. Native key
 * permissions and root administrators apply throughout the resolver instance.
 */
export function checkResolverPolicy(input: {
  policy: CurrentResolverPolicy;
  name: string;
  parentRegistry: Address;
  resolver: Address;
  recordId: bigint;
  recordCount: bigint;
}): { authorityParts: string[]; coverage: string[] } {
  const { policy, recordId, recordCount, name, resolver, parentRegistry } = input;
  if (recordId <= 0n) throw new Error("Exact name record link required; default records are unsupported");
  if (policy.mode === "dedicated") {
    if (recordId !== 1n || recordCount !== 1n)
      throw new Error("Dedicated policy requires one record bundle");
    return {
      authorityParts: ["dedicated"],
      coverage: ["single-record bundle check; aliases are not enumerated"],
    };
  }
  if (policy.mode !== "provider-shared") throw new Error("Unsupported resolver policy");
  const provider = normalize(policy.providerName);
  if (!provider.endsWith(".eth") ||
      name.split(".").slice(1).join(".") !== provider ||
      !sameAddress(policy.providerRegistry, parentRegistry) ||
      !sameAddress(policy.resolver, resolver) ||
      sameAddress(parentRegistry, zeroAddress) || sameAddress(resolver, zeroAddress))
    throw new Error("Service does not match the configured provider resolver group");
  return {
    authorityParts: ["provider-shared", provider, parentRegistry.toLowerCase(), resolver.toLowerCase()],
    coverage: [
      "configured provider name, parent registry and shared resolver matched",
      "exact name has a nonzero record link; aliases are not enumerated",
      "key permissions span the provider resolver, not individual services",
      "configuration defines the trusted group; exclusive resolver membership is not proven",
    ],
  };
}
