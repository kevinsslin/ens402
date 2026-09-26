/** Read-only role audit. Missing configuration and RPC errors never become a passing result. */
import { config } from "dotenv";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { mkdir, writeFile } from "node:fs/promises";
import { resolveService } from "../packages/sdk/src/ens";
import { auditTextPermissions } from "../packages/sdk/src/ens/permissions";
import { wallet, required } from "./ens/shared";
config({ path: ".env", quiet: true });
try {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(required("SEPOLIA_RPC_URL")),
    ccipRead: false,
  });
  const service = await resolveService(client, required("SERVICE_ENS_NAME"));
  const admin = wallet("ENS_OWNER_ADDRESS");
  const result = await auditTextPermissions(client, {
    resolver: service.resolver,
    admin,
    ops: wallet("ENS_OPERATOR_ADDRESS"),
    treasury: wallet("ENS_TREASURY_ADDRESS"),
  });
  const report = {
    name: service.name,
    owner: service.owner,
    expectedOwner: admin,
    ownerMatches: service.owner.toLowerCase() === admin.toLowerCase(),
    ...result,
  };
  await mkdir("docs/validation", { recursive: true });
  await writeFile(
    "docs/validation/live-text-permissions.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed || !report.ownerMatches) process.exitCode = 1;
} catch {
  console.log(
    JSON.stringify({
      passed: false,
      status: "unverified",
      reason:
        "Configure the service name, Admin/Ops/Treasury addresses and Sepolia RPC; the supported resolver must already be published. No transaction sent.",
    }),
  );
  process.exitCode = 1;
}
