/** Prepare a resumable, unsigned Platform -> Provider registry setup. Never broadcasts. */
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { bytesToHex, encodeFunctionData, zeroAddress, type Address } from "viem";
import { currentRegistryAbi, factoryAbi } from "../packages/sdk/src/ens/index";
import { deployment, ensName, required, savePlan, setupClient, wallet } from "./ens/shared";
import { sharedResolverPlan } from "./ens/provider-shared";
import { providerRegistrarPlan } from "./ens/provider-registrar";
import { providerInitialization, providerLabel, providerRegistryAbi, providerRoles } from "./ens/provider-config";

const parent = ensName("ENS_PARENT_NAME");
const label = providerLabel(required("PROVIDER_LABEL"));
const admin = wallet("PROVIDER_ADMIN_ADDRESS");
const signer = wallet("PLATFORM_REGISTRAR_ADDRESS");
const name = `${label}.${parent}`;
const filename = `provider-${label}-transactions.json`;
const { client, block } = await setupClient();
let platform: Address = deployment.rootRegistry;
let parentExpiry = (1n << 64n) - 1n;
for (const part of parent.split(".").reverse()) {
  const expiry = await client.readContract({ address: platform, abi: providerRegistryAbi,
    functionName: "findExpiry", args: [part], blockNumber: block.number });
  parentExpiry = expiry < parentExpiry ? expiry : parentExpiry;
  platform = await client.readContract({ address: platform, abi: currentRegistryAbi,
    functionName: "getSubregistry", args: [part], blockNumber: block.number });
  if (platform === zeroAddress) throw new Error("Initialize the platform namespace first");
}
if (parentExpiry <= block.timestamp + 86400n) throw new Error("Renew ancestors before provider setup");
const existingOwner = await client.readContract({ address: platform, abi: currentRegistryAbi,
  functionName: "findOwner", args: [label], blockNumber: block.number });
if (existingOwner !== zeroAddress && existingOwner.toLowerCase() !== admin.toLowerCase())
  throw new Error("Provider name belongs to another owner; refusing replacement");
let previous: { name?: string; admin?: string; signer?: string; registry?: Address; salt?: string; expiry?: string; ops?: Address; treasury?: Address; sharedResolver?: { resolver: Address; salt: string } } | undefined;
try { previous = JSON.parse(await readFile(`docs/setup/${filename}`, "utf8")); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
if (previous && (previous.name !== name || previous.admin !== admin || previous.signer !== signer))
  throw new Error("Existing plan identity differs; archive it explicitly before starting a new setup");
const salt = previous?.salt ? BigInt(previous.salt) : BigInt(bytesToHex(randomBytes(32)));
const expiry = previous?.expiry ? BigInt(previous.expiry) :
  (parentExpiry < block.timestamp + 30n * 86400n ? parentExpiry : block.timestamp + 30n * 86400n);
if (expiry > parentExpiry || expiry <= block.timestamp + 86400n) throw new Error("Plan expiry must fit all ancestors and remain valid");
const transactions: { signer: Address; to: Address; value: string; data: string; description: string }[] = [];
let registry = previous?.registry;
const deployed = registry && await client.getCode({ address: registry, blockNumber: block.number });
if (!deployed || deployed === "0x") {
  const { result } = await client.simulateContract({ account: admin, address: deployment.factory,
    abi: factoryAbi, functionName: "deployProxy", args: [deployment.registryImplementation, salt, providerInitialization(admin)] });
  if (registry && registry.toLowerCase() !== result.toLowerCase()) throw new Error("Factory prediction changed");
  registry = result;
  transactions.push({ signer: admin, to: deployment.factory, value: "0x0",
    data: encodeFunctionData({ abi: factoryAbi, functionName: "deployProxy",
      args: [deployment.registryImplementation, salt, providerInitialization(admin)] }),
    description: "Deploy provider native UserRegistry with registrar and registrar-admin only" });
} else {
  const implementation = await client.readContract({ address: deployment.factory, abi: factoryAbi,
    functionName: "verifyContract", args: [registry!], blockNumber: block.number });
  if (implementation.toLowerCase() !== deployment.registryImplementation.toLowerCase()) throw new Error("Unexpected provider implementation");
  const allowed = await client.readContract({ address: registry!, abi: providerRegistryAbi,
    functionName: "hasRootRoles", args: [providerRoles.registrar | providerRoles.registrarAdmin, admin], blockNumber: block.number });
  if (!allowed) throw new Error("Provider admin roles missing; inspect before resuming");
}
if (existingOwner === zeroAddress) {
  const authorized = await client.readContract({ address: platform, abi: providerRegistryAbi,
    functionName: "hasRootRoles", args: [providerRoles.registrar, signer], blockNumber: block.number });
  if (!authorized) throw new Error("Platform signer lacks native ROLE_REGISTRAR");
  transactions.push({ signer, to: platform, value: "0x0",
    data: encodeFunctionData({ abi: providerRegistryAbi, functionName: "register",
      args: [label, admin, registry!, zeroAddress, providerRoles.name, expiry] }),
    description: "Register provider name to Provider Admin and attach its registry atomically" });
} else {
  const pointer = await client.readContract({ address: platform, abi: currentRegistryAbi,
    functionName: "getSubregistry", args: [label], blockNumber: block.number });
  if (!registry || pointer.toLowerCase() !== registry.toLowerCase()) throw new Error("Existing provider pointer differs; refusing replacement");
}
const wantsRegistrar = process.argv.includes("--with-service-registrar");
const isolated = process.argv.includes("--isolated-resolvers");
const ops = wantsRegistrar && !isolated ? wallet("PROVIDER_OPS_ADDRESS") : undefined;
const treasury = wantsRegistrar && !isolated ? wallet("PROVIDER_TREASURY_SAFE_ADDRESS") : undefined;
if ((previous?.ops && ops && previous.ops.toLowerCase() !== ops.toLowerCase()) ||
    (previous?.treasury && treasury && previous.treasury.toLowerCase() !== treasury.toLowerCase()))
  throw Error("Pinned shared delegates changed; use an explicit rotation workflow, not initialization");
const sharedResolver = wantsRegistrar && !isolated && transactions.length === 0
  ? await sharedResolverPlan(client, admin, ops!, treasury!, name,
      previous?.sharedResolver ? BigInt(previous.sharedResolver.salt) : BigInt(bytesToHex(randomBytes(32))), block.number, previous?.sharedResolver?.resolver)
  : previous?.sharedResolver;
const registrarPlan = wantsRegistrar && transactions.length === 0 && (isolated || (sharedResolver && "transactions" in sharedResolver && Array.isArray(sharedResolver.transactions) && sharedResolver.transactions.length === 0))
  ? await providerRegistrarPlan(client, admin, registry!, name, expiry, block.number,
      process.env.PROVIDER_SERVICE_REGISTRAR_ADDRESS ? wallet("PROVIDER_SERVICE_REGISTRAR_ADDRESS") : undefined, isolated ? undefined : sharedResolver!.resolver, isolated ? undefined : wallet("PROVIDER_OPS_ADDRESS"), isolated ? undefined : wallet("PROVIDER_TREASURY_SAFE_ADDRESS"))
  : undefined;
await savePlan(filename, { name, admin, signer, registry, salt: String(salt), expiry: String(expiry),
  chainId: deployment.chainId, observedBlock: String(block.number), sourceCommit: deployment.sourceCommit,
  status: transactions.length ? "awaiting-owner-transactions" : "provider-linked",
  transactions,
  ops: ops ?? previous?.ops, treasury: treasury ?? previous?.treasury,
  sharedResolver,
  registrarPlan,
  env: sharedResolver ? { PROVIDER_ENS_NAME: name, PROVIDER_REGISTRY_ADDRESS: registry,
    PROVIDER_RESOLVER_ADDRESS: sharedResolver.resolver } : undefined,
  notes: ["Review and sign in order. Rerun after each receipt to skip completed steps.",
    "Existing root grants and ancestor replacement/expiry paths are not an emancipation audit.",
    "Provider Admin receives name-scoped renewal/pointer administration and registry-root registration administration. No service resolver text rights are inherited.",
    "Do not grant this provider registry to the current permissionless ServiceRegistrar: anyone could register inside the company namespace. Use --with-service-registrar after the provider is linked to prepare the restricted variant.",
    "Restricted registrar deployment and verified grant are separate stages. Rerun after every receipt; no grant is emitted for unverified bytecode.",
    "Default shared resolver: Ops and Treasury Safe key permissions cover every service. Provider Admin retains root text writing and regrant governance. Service registrants get no resolver root rights. --isolated-resolvers retains the alternative.",
    "Treasury Safe is a control wallet, not a requirement for service payTo. Contract-code presence does not verify its Safe owners or threshold."],
});
