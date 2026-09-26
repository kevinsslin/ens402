/** Prepare commit/reveal transactions for the labeled fixture catalog. Never signs or broadcasts. */
import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  bytesToHex,
  createPublicClient,
  encodeFunctionData,
  http,
  parseAbi,
  zeroAddress,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { serviceRegistrarAbi } from "../packages/sdk/src/ens/registration";
import { validateDiscoveryService } from "../packages/sdk/src/discovery";
import { parseCallMetadata } from "../packages/sdk/src/call";
import { providerRegistryAbi, providerRoles } from "./ens/provider-config";
import { currentRegistryAbi } from "../packages/sdk/src/ens/current";
import type { Catalog } from "../packages/server/src/discovery";
config({ path: ".env", quiet: true });
function value(key: string) {
  const raw = (process.env[key] || (key === "PROVIDER_TREASURY_ADMIN_ADDRESS" ? process.env.PROVIDER_TREASURY_SAFE_ADDRESS : undefined))?.trim();
  if (!raw) throw Error(`Configure ${key}`);
  return raw;
}
function address(key: string): Address {
  const raw = value(key);
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw) || raw.toLowerCase() === zeroAddress)
    throw Error(`Invalid ${key}`);
  return raw as Address;
}
try {
  const path = process.argv[2];
  if (!path) throw Error("Supply the fixture catalog path");
  const provider = value("PROVIDER_ENS_NAME");
  const registrar = address("PROVIDER_SERVICE_REGISTRAR_ADDRESS");
  const registry = address("PROVIDER_REGISTRY_ADDRESS");
  const resolver = address("PROVIDER_RESOLVER_ADDRESS");
  const admin = address("PROVIDER_ADMIN_ADDRESS");
  const ops = address("PROVIDER_OPS_ADDRESS");
  const treasury = address("PROVIDER_TREASURY_ADMIN_ADDRESS");
  const client = createPublicClient({
    chain: sepolia,
    transport: http(value("SEPOLIA_RPC_URL")),
    ccipRead: false,
  });
  if ((await client.getChainId()) !== 11155111) throw Error("Use Sepolia");
  const actualRegistry = await client.readContract({
    address: registrar,
    abi: serviceRegistrarAbi,
    functionName: "registry",
  });
  const actualResolver = await client.readContract({
    address: registrar,
    abi: serviceRegistrarAbi,
    functionName: "sharedResolver",
  });
  if (
    actualRegistry.toLowerCase() !== registry.toLowerCase() ||
    actualResolver.toLowerCase() !== resolver.toLowerCase()
  )
    throw Error("Registrar bindings differ from provider configuration");
  if (
    !(await client.readContract({
      address: registry,
      abi: providerRegistryAbi,
      functionName: "hasRootRoles",
      args: [providerRoles.registrar, admin],
    }))
  )
    throw Error("Provider Admin needs publication authority");
  const raw = await readFile(path, "utf8");
  if (Buffer.byteLength(raw) > 100000) throw Error("Fixture catalog too large");
  const catalog = JSON.parse(raw) as Catalog;
  if (
    !Array.isArray(catalog.services) ||
    catalog.services.length < 1 ||
    catalog.services.length > 10
  )
    throw Error("Expected 1 to 10 fixture services");
  const plans = [];
  for (const { service: entry } of catalog.services) {
    validateDiscoveryService(entry);
    if (!entry.fixture || !entry.name.endsWith(`.${provider}`))
      throw Error("Catalog must contain fixtures under the selected provider");
    const label = entry.name.slice(0, -(provider.length + 1));
    if (!/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(label))
      throw Error("Only direct service labels are supported");
    if (
      (await client.readContract({
        address: registry,
        abi: currentRegistryAbi,
        functionName: "findOwner",
        args: [label],
      })) !== zeroAddress
    )
      throw Error(
        "A fixture name is already registered; edit it through native EAC instead",
      );
    if (entry.payTo.toLowerCase() !== admin.toLowerCase())
      throw Error("Fixture recipient must equal registering name owner");
    const secret = bytesToHex(randomBytes(32));
    const callConfig = JSON.stringify({ ...entry.call, fixture: true });
    parseCallMetadata(callConfig);
    const service = {
      label,
      endpoint: entry.endpoint,
      payTo: entry.payTo as Address,
      endpointOperator: ops,
      treasury,
      description: entry.description,
      picture: "",
      price: BigInt(entry.pricePerRequestAtomic),
      callConfig,
    };
    const commitment = await client.readContract({
      address: registrar,
      abi: serviceRegistrarAbi,
      functionName: "makeCommitment",
      args: [service, admin, secret],
    });
    const durations = parseAbi([
      "function MIN_COMMITMENT_AGE() view returns(uint256)",
      "function MAX_COMMITMENT_AGE() view returns(uint256)",
    ]);
    const min = await client.readContract({
      address: registrar,
      abi: durations,
      functionName: "MIN_COMMITMENT_AGE",
    });
    const max = await client.readContract({
      address: registrar,
      abi: durations,
      functionName: "MAX_COMMITMENT_AGE",
    });
    plans.push({
      name: entry.name,
      signer: admin,
      secret,
      commitment,
      revealAfterSeconds: String(min),
      revealBeforeSeconds: String(max),
      transactions: [
        {
          stage: "commit",
          to: registrar,
          value: "0",
          data: encodeFunctionData({
            abi: serviceRegistrarAbi,
            functionName: "commit",
            args: [commitment],
          }),
        },
        {
          stage: "reveal-after-confirmed-commit-delay",
          to: registrar,
          value: "0",
          data: encodeFunctionData({
            abi: serviceRegistrarAbi,
            functionName: "register",
            args: [service, secret],
          }),
        },
      ],
    });
  }
  await mkdir(".local", { recursive: true, mode: 0o700 });
  const output = `.local/fixture-registration-${Date.now()}.json`;
  await writeFile(
    output,
    JSON.stringify(
      {
        chainId: 11155111,
        provider,
        registry,
        resolver,
        plans,
        note: "Unsigned. Review each signer and transaction. Registration is not listing: wait for finalized discovery synchronization.",
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    `Prepared ${plans.length} unsigned registrations in ${output}. No transaction sent.`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "";
  const safe =
    /^(Configure [A-Z_]+$|Invalid [A-Z_]+$|Supply the fixture catalog path$|Only direct service labels are supported$|A fixture name is already registered;|Provider Admin needs publication authority$|Registrar bindings differ|Catalog must contain fixtures)/.test(
      message,
    );
  console.error(
    safe
      ? message
      : "Fixture plan unavailable. Confirm catalog and provider setup, then retry.",
  );
  console.error("No transaction was sent.");
  process.exitCode = 1;
}
