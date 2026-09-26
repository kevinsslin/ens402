import type { ProviderSetup } from "@/server/provider-plan";

/** Discard unsigned predictions only. Never erase deployed setup during editing. */
export function editableProviderSetup(setup: ProviderSetup, hasConfirmedSetup: boolean): ProviderSetup {
  setup = { ...setup, ...(setup.confirmedResolver === false ? { resolver: undefined } : {}) };
  if (hasConfirmedSetup || setup.confirmedSetup || setup.resolver || setup.registrar) return { ...setup };
  return { ...setup, registry: undefined, expiry: undefined, resolverSalt: undefined };
}
