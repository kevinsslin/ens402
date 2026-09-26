import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  http,
  isAddress,
  keccak256,
  zeroAddress,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import {
  currentDeployment,
  currentRegistryAbi,
} from "../../packages/sdk/src/ens/current";

config({ path: ".env", quiet: true });
export const deployment = currentDeployment;
export const roles = {
  ROLE_REGISTRAR: 1n,
  ROLE_REGISTRAR_ADMIN: 1n << 128n,
  ROLE_SET_TEXT: 16n,
  ROLE_SET_TEXT_ADMIN: 16n << 128n,
} as const;
export function required(key: string): string {
  const value = (process.env[key] || (key === "PROVIDER_TREASURY_ADMIN_ADDRESS" ? process.env.PROVIDER_TREASURY_SAFE_ADDRESS : undefined))?.trim();
  if (!value) throw new Error(`Set ${key} in root .env`);
  return value;
}
export function wallet(key: string): Address {
  const value = required(key);
  if (
    !isAddress(value, { strict: false }) ||
    value.toLowerCase() === zeroAddress
  ) {
    throw new Error(`${key} must be a nonzero public wallet address`);
  }
  return value as Address;
}
export function ensName(key: string): string {
  const value = normalize(required(key));
  if (!value.endsWith(".eth") || value.includes(","))
    throw new Error(`${key} must be one full .eth name`);
  return value;
}
export async function setupClient() {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(required("SEPOLIA_RPC_URL")),
    ccipRead: false,
  });
  if ((await client.getChainId()) !== deployment.chainId)
    throw new Error("ENS setup requires Sepolia");
  const block = await client.getBlock();
  for (const [address, hash] of [
    [deployment.factory, deployment.factoryCodeHash],
    [
      deployment.resolverImplementation,
      deployment.resolverImplementationCodeHash,
    ],
  ] as const) {
    const code = await client.getCode({ address, blockNumber: block.number });
    if (!code || keccak256(code) !== hash)
      throw new Error(
        "Native ENS deployment changed; stop and refresh the pin",
      );
  }
  return { client, block };
}
export async function ownedName(
  client: Awaited<ReturnType<typeof setupClient>>["client"],
  name: string,
  owner: Address,
  blockNumber: bigint,
) {
  const labels = name.split(".");
  let registry: Address = deployment.rootRegistry;
  for (let i = labels.length - 1; i > 0; i--) {
    registry = await client.readContract({
      address: registry,
      abi: currentRegistryAbi,
      functionName: "getSubregistry",
      args: [labels[i]!],
      blockNumber,
    });
    if (registry === zeroAddress)
      throw new Error(
        `Missing native subregistry for ${labels.slice(i).join(".")}`,
      );
  }
  const actual = await client.readContract({
    address: registry,
    abi: currentRegistryAbi,
    functionName: "findOwner",
    args: [labels[0]!],
    blockNumber,
  });
  if (actual.toLowerCase() !== owner.toLowerCase())
    throw new Error(
      `${name}: expected owner ${owner}, observed ${actual} on pinned ENSv2 Sepolia. Confirm the registration transaction/network.`,
    );
  return { registry, label: labels[0]! };
}
export async function savePlan(filename: string, plan: object) {
  await mkdir("docs/setup", { recursive: true });
  await writeFile(
    `docs/setup/${filename}`,
    JSON.stringify(plan, null, 2) + "\n",
  );
  console.log(`Prepared docs/setup/${filename}. No transaction sent.`);
}
