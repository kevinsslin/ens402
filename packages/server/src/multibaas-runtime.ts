import { createMultiBaasEnsEventReader, type EnsContractKind, type IndexedEnsEventsOptions } from "./multibaas";

/** MultiBaas adds event observations; fresh ENS resolution remains authoritative. */
export function observeEnsChanges(kind: EnsContractKind, options: IndexedEnsEventsOptions = {}) {
  const deploymentUrl = process.env.MULTIBAAS_BASE_URL;
  const apiKey = process.env.MULTIBAAS_API_KEY;
  const contractAddress = kind === "Registry"
    ? process.env.MULTIBAAS_ENS_REGISTRY_ADDRESS
    : process.env.MULTIBAAS_ENS_RESOLVER_ADDRESS;
  if (!deploymentUrl || !apiKey || !contractAddress)
    throw new Error("MultiBaas ENS monitoring is not configured");
  return createMultiBaasEnsEventReader({
    deploymentUrl,
    apiKey,
    contractAddress,
    contractKind: kind,
  })(options);
}
