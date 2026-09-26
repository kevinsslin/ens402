/** Read-only setup audit. Never print credentials or provider error messages. */
import { config } from "dotenv";
import { writeFile, mkdir } from "node:fs/promises";
import { createPublicClient, http, zeroAddress } from "viem";
import { sepolia } from "viem/chains";
import {
  currentDeployment,
  currentRegistryAbi,
} from "../packages/sdk/src/ens/current";
import { resolveService } from "../packages/sdk/src/ens";
config({ path: ".env", quiet: true });
const report: Record<string, unknown> = {
  checkedAt: new Date().toISOString(),
  scope: "Read-only public testnet and local environment checks",
};
const keys = [
  "DATABASE_URL",
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "INTERCEPTA_API_KEY",
  "SERVICE_ENS_NAME",
  "SERVICE_REGISTRAR_ADDRESS",
  "ENS_PURCHASE_REGISTRY",
  "ENS_PURCHASE_EXPIRY",
  "ENS_REGISTRATION_PRIVATE_KEY",
  "ENS_REGISTRATION_RESOURCE_URL",
  "SERVICE_DESCRIPTION",
];
report.environment = Object.fromEntries(
  keys.map((k) => [k, Boolean(process.env[k]?.trim())]),
);
const client = createPublicClient({
  chain: sepolia,
  transport: http(process.env.SEPOLIA_RPC_URL, {
    timeout: 10000,
    retryCount: 0,
  }),
  ccipRead: false,
});
try {
  const block = await client.getBlock();
  report.ensBlock = String(block.number);
  let registry: `0x${string}` = currentDeployment.rootRegistry;
  const parent = process.env.ENS_PARENT_NAME || "ens402.eth";
  for (const label of parent.split(".").reverse()) {
    const owner = await client.readContract({
      address: registry,
      abi: currentRegistryAbi,
      functionName: "findOwner",
      args: [label],
    });
    const child = await client.readContract({
      address: registry,
      abi: currentRegistryAbi,
      functionName: "getSubregistry",
      args: [label],
    });
    if (label === parent.split(".")[0])
      report.parent = {
        name: parent,
        owner,
        childRegistry: child,
        enabled: child !== zeroAddress,
      };
    registry = child;
  }
} catch {
  report.ens = "Read unavailable";
}
report.services = [];
for (const name of (process.env.SERVICE_ENS_NAME || "")
  .split(",")
  .filter(Boolean)) {
  try {
    const s = await resolveService(client, name);
    (report.services as unknown[]).push({
      name,
      resolved: true,
      schema: s.payment.version,
      description: !!s.description,
      endpoint: s.endpoint,
    });
  } catch {
    (report.services as unknown[]).push({ name, resolved: false });
  }
}
await mkdir("docs/validation", { recursive: true });
await writeFile(
  "docs/validation/readiness-audit.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
