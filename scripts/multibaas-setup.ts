import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { parseAbi } from "viem";

config({ path: ".env", quiet: true });

const deployment = process.env.MULTIBAAS_BASE_URL;
const apiKey = process.env.MULTIBAAS_API_KEY;
const registryAddress = process.env.MULTIBAAS_ENS_REGISTRY_ADDRESS;
const resolverAddress = process.env.MULTIBAAS_ENS_RESOLVER_ADDRESS;
const startingBlock = process.env.MULTIBAAS_START_BLOCK ?? "-80";
if (!deployment || !apiKey || !registryAddress || !resolverAddress)
  throw Error("Configure the MultiBaas deployment, key and ENS contract addresses");
const base = new URL(deployment);
if (base.protocol !== "https:" || !base.hostname.endsWith(".multibaas.com") || base.pathname !== "/")
  throw Error("Use a MultiBaas HTTPS deployment origin");
if (!/^(?:latest|\d+|-[1-9]\d*)$/.test(startingBlock)) throw Error("Invalid MultiBaas starting block");
for (const value of [registryAddress, resolverAddress])
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw Error("Invalid ENS contract address");

async function api(path: string, body?: unknown): Promise<{ status: number; result: unknown }> {
  const response = await fetch(new URL(`/api/v0${path}`, base), {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null) as { message?: unknown } | null;
    const message = typeof failure?.message === "string" ? failure.message.slice(0, 180) : "request rejected";
    throw Error(`MultiBaas setup request failed (${response.status}) at ${path}: ${message}`);
  }
  const json = await response.json() as { status: number; result: unknown };
  if (json.status !== response.status) throw Error(`Unexpected MultiBaas response at ${path}`);
  return json;
}

const status = await api("/chains/ethereum/status");
if ((status.result as { chainID?: number })?.chainID !== 11155111)
  throw Error("This MultiBaas deployment must use Ethereum Sepolia");

const registrySource = JSON.parse(await readFile("indexer/abis/UserRegistry.json", "utf8")) as Array<{ type: string; name?: string }>;
const registryAbi = registrySource.filter(item => item.type === "event" && ["LabelRegistered", "ResolverUpdated", "SubregistryUpdated", "EACRolesChanged"].includes(item.name ?? ""));
const resolverAbi = parseAbi([
  "event TextUpdated(uint256 indexed recordId,string indexed keyHash,string key,string value)",
  "event Linked(uint256 indexed recordId,bytes32 indexed node,bytes name)",
  "event EACRolesChanged(uint256 indexed resource,address indexed account,uint256 oldRoleBitmap,uint256 newRoleBitmap)",
]);
for (const spec of [
  { label: "ens402registry", contractName: "ENSv2UserRegistry", address: registryAddress, abi: registryAbi },
  { label: "ens402resolver", contractName: "ENSv2PermissionedResolver", address: resolverAddress, abi: resolverAbi },
]) {
  const contracts = (await api("/contracts")).result as Array<{ label: string }>;
  if (!contracts.some(item => item.label === spec.label)) {
    await api(`/contracts/${spec.label}`, {
      label: spec.label,
      contractName: spec.contractName,
      version: "1.0.0",
      bin: "0x",
      rawAbi: JSON.stringify(spec.abi),
    });
    console.log(`Added ${spec.label} ABI to MultiBaas`);
  }
  const path = `/chains/ethereum/addresses/${spec.address}`;
  const address = (await api(path)).result as { contracts?: Array<{ label: string }> };
  if (!address.contracts?.some(item => item.label === spec.label)) {
    await api(`${path}/contracts`, {
      label: spec.label,
      version: "1.0.0",
      startingBlock,
    });
    console.log(`Linked ${spec.label} at ${spec.address} from block ${startingBlock}`);
  } else {
    console.log(`${spec.label} is already linked`);
  }
}
