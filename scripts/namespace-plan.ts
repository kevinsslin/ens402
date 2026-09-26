/** Platform setup only: parent -> native UserRegistry -> ENS402 ServiceRegistrar. */
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import {
  encodeFunctionData,
  encodeDeployData,
  bytesToHex,
  parseAbi,
  zeroAddress,
} from "viem";
import { packetToBytes, labelhash } from "viem/ens";
import { currentRegistryAbi, factoryAbi } from "../packages/sdk/src/ens/index";
import {
  deployment,
  roles,
  wallet,
  ensName,
  setupClient,
  ownedName,
  savePlan,
} from "./ens/shared";

const nativeOnly = process.argv.includes("--native-only");
const name = ensName("ENS_PARENT_NAME");
const owner = wallet("ENS_OWNER_ADDRESS");
const { client, block } = await setupClient();
const { registry: parentRegistry, label } = await ownedName(
  client,
  name,
  owner,
  block.number,
);
const existing = await client.readContract({
  address: parentRegistry,
  abi: currentRegistryAbi,
  functionName: "getSubregistry",
  args: [label],
  blockNumber: block.number,
});
if (existing !== zeroAddress)
  throw new Error(
    `Existing child registry ${existing}. Inspect its roles before reuse; this command will not replace it.`,
  );
const nativeAbi = parseAbi([
  "function setSubregistry(uint256 anyId,address registry)",
  "function findExpiry(string label) view returns(uint64)",
]);
const parentExpiry = await client.readContract({
  address: parentRegistry,
  abi: nativeAbi,
  functionName: "findExpiry",
  args: [label],
  blockNumber: block.number,
});
const expiry =
  parentExpiry < block.timestamp + 30n * 86400n
    ? parentExpiry
    : block.timestamp + 30n * 86400n;
if (expiry <= block.timestamp + 86400n)
  throw new Error("Renew the parent before deploying the namespace");
const salt = BigInt(bytesToHex(randomBytes(32)));
const initialize = encodeFunctionData({
  abi: currentRegistryAbi,
  functionName: "initialize",
  args: [
    [
      {
        account: owner,
        roleBitmap: roles.ROLE_REGISTRAR | roles.ROLE_REGISTRAR_ADMIN,
      },
    ],
  ],
});
const { result: childRegistry } = await client.simulateContract({
  account: owner,
  address: deployment.factory,
  abi: factoryAbi,
  functionName: "deployProxy",
  args: [deployment.registryImplementation, salt, initialize],
});
const artifact = JSON.parse(
  await readFile(
    "contracts/out/ServiceRegistrar.sol/ServiceRegistrar.json",
    "utf8",
  ),
);
const registrarDeployment = encodeDeployData({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  args: [
    childRegistry,
    deployment.factory,
    deployment.resolverImplementation,
    bytesToHex(packetToBytes(name)),
    expiry,
  ],
});
await savePlan("namespace-transactions.json", {
  purpose: "Enable the platform namespace, not an individual service",
  chainId: deployment.chainId,
  name,
  owner,
  childRegistry,
  expiry: String(expiry),
  observedBlock: String(block.number),
  sourceCommit: deployment.sourceCommit,
  permissions: [
    {
      wallet: owner,
      contract: childRegistry,
      resource: "root (0)",
      roles: ["ROLE_REGISTRAR", "ROLE_REGISTRAR_ADMIN"],
      effect: "Issue names and manage registrar grants",
    },
    {
      wallet: nativeOnly
        ? "DEDICATED_REGISTRATION_WORKER"
        : "DEPLOYED_SERVICE_REGISTRAR",
      contract: childRegistry,
      resource: "root (0)",
      roles: ["ROLE_REGISTRAR"],
      effect: "Issue names; no registrar administration",
    },
  ],
  notes: [
    "Unsigned plan. Only native registry deployment is simulated. Parent owner signs steps in order.",
    nativeOnly
      ? "Native-only purchase setup: grant ROLE_REGISTRAR to a dedicated worker. No custom registrar deployment is needed."
      : "After step 3, copy contractAddress from the creation receipt into the final grant template.",
    "Parent owner has namespace powers. Each service registrant separately receives resolver text administration.",
    "Never run service configuration on the parent just to enable subdomain registration.",
  ],
  transactions: [
    {
      step: 1,
      to: deployment.factory,
      value: "0x0",
      data: encodeFunctionData({
        abi: factoryAbi,
        functionName: "deployProxy",
        args: [deployment.registryImplementation, salt, initialize],
      }),
      description:
        "Deploy native UserRegistry with owner registrar/admin rights",
    },
    {
      step: 2,
      to: parentRegistry,
      value: "0x0",
      data: encodeFunctionData({
        abi: nativeAbi,
        functionName: "setSubregistry",
        args: [BigInt(labelhash(label)), childRegistry],
      }),
      description: "Point the parent name to the new child registry",
    },
    ...(!nativeOnly
      ? [
          {
            step: 3,
            value: "0x0",
            data: registrarDeployment,
            description:
              "Deploy ENS402 ServiceRegistrar; record its contractAddress",
          },
        ]
      : []),
  ],
  finalGrant: {
    step: nativeOnly ? 3 : 4,
    to: childRegistry,
    function: "grantRootRoles(uint256,address)",
    roleBitmap: String(roles.ROLE_REGISTRAR),
    account: nativeOnly
      ? "REPLACE_WITH_DEDICATED_REGISTRATION_WORKER"
      : "REPLACE_WITH_DEPLOYED_SERVICE_REGISTRAR",
  },
  env: {
    ENS_PARENT_NAME: name,
    ...(nativeOnly
      ? {
          ENS_PURCHASE_REGISTRY: childRegistry,
          ENS_PURCHASE_EXPIRY: String(expiry),
        }
      : {
          SERVICE_REGISTRAR_ADDRESS: "REPLACE_WITH_DEPLOYED_SERVICE_REGISTRAR",
        }),
  },
});
