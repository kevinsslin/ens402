/** Configure one already-registered service. For platform namespace setup use namespace-plan.ts. */
import { randomBytes } from "node:crypto";
import { bytesToHex, encodeFunctionData, type Address } from "viem";
import { labelhash } from "viem/ens";
import {
  factoryAbi,
  currentResolverAbi,
  prepareRecordUpdate,
  prepareTextPermission,
  validateEndpoint,
  parsePaymentRecord,
} from "../packages/sdk/src/ens/index";
import { registryAbi } from "../packages/sdk/src/ens/abi";
import { NETWORK, USDC } from "../packages/sdk/src/index";
import {
  deployment,
  roles,
  required,
  wallet,
  ensName,
  setupClient,
  ownedName,
  savePlan,
} from "./ens/shared";

const name = ensName("SERVICE_ENS_NAME");
const admin = wallet("ENS_OWNER_ADDRESS");
const ops = wallet("ENS_OPERATOR_ADDRESS");
const treasury = wallet("ENS_TREASURY_ADDRESS");
if (
  ops.toLowerCase() === admin.toLowerCase() ||
  ops.toLowerCase() === treasury.toLowerCase()
) {
  throw new Error(
    "Ops must be separate from Admin and Treasury to remain endpoint-only",
  );
}
const endpoint = validateEndpoint(required("MERCHANT_RESOURCE_URL"));
const payment = parsePaymentRecord(
  JSON.stringify({
    version: 2,
    scheme: "exact",
    network: NETWORK,
    asset: USDC,
    payTo: wallet("MERCHANT_PAY_TO"),
    pricing: {
      model: "fixed",
      amount: required("MERCHANT_PRICE_UNITS"),
      unit: "request",
    },
  }),
);
const { client, block } = await setupClient();
const { registry, label } = await ownedName(client, name, admin, block.number);
const salt = BigInt(bytesToHex(randomBytes(32)));
const initialize = encodeFunctionData({
  abi: currentResolverAbi,
  functionName: "initialize",
  args: [
    [
      {
        account: admin,
        roleBitmap: roles.ROLE_SET_TEXT | roles.ROLE_SET_TEXT_ADMIN,
      },
    ],
    [],
  ],
});
const { result: resolver } = await client.simulateContract({
  account: admin,
  address: deployment.factory,
  abi: factoryAbi,
  functionName: "deployProxy",
  args: [deployment.resolverImplementation, salt, initialize],
});
const service = { name, resolver, deployment: "current" as const };
await savePlan("ens-transactions.json", {
  purpose: "Configure one service, not the platform namespace",
  chainId: deployment.chainId,
  name,
  admin,
  ops,
  treasury,
  predictedResolver: resolver,
  sourceCommit: deployment.sourceCommit,
  observedBlock: String(block.number),
  permissions: [
    {
      wallet: admin,
      contract: resolver,
      resource: "root (0)",
      roles: ["ROLE_SET_TEXT", "ROLE_SET_TEXT_ADMIN"],
      effect: "Write every text key; grant or revoke text writers",
    },
    {
      wallet: ops,
      contract: resolver,
      resource: "keccak256(agent-endpoint[x402])",
      roles: ["ROLE_SET_TEXT"],
      effect: "Write endpoint only",
    },
    {
      wallet: treasury,
      contract: resolver,
      resource: "keccak256(ens402.payment)",
      roles: ["ROLE_SET_TEXT"],
      effect:
        "Write payment configuration only; existing root roles still override",
    },
  ],
  notes: [
    "Unsigned plan. Only resolver deployment is simulated; later steps require preceding transactions.",
    "Admin sends each transaction in order. Resolver pointer is published last.",
    "Existing registry/ancestor powers are not changed by this plan.",
  ],
  transactions: [
    {
      to: deployment.factory,
      value: "0x0",
      data: encodeFunctionData({
        abi: factoryAbi,
        functionName: "deployProxy",
        args: [deployment.resolverImplementation, salt, initialize],
      }),
      description: "1. Deploy native resolver with Admin root text rights",
    },
    prepareRecordUpdate(service, "agent-endpoint[x402]", endpoint),
    prepareRecordUpdate(service, "ens402.payment", JSON.stringify(payment)),
    prepareRecordUpdate(service, "ens402.status", "active"),
    prepareRecordUpdate(
      service,
      "description",
      required("SERVICE_DESCRIPTION"),
    ),
    prepareRecordUpdate(
      service,
      "avatar",
      process.env.SERVICE_PICTURE_URL || "",
    ),
    prepareTextPermission(service, "description", ops, true),
    prepareTextPermission(service, "avatar", ops, true),
    prepareTextPermission(service, "agent-endpoint[x402]", ops, true),
    prepareTextPermission(service, "ens402.payment", treasury, true),
    {
      to: registry,
      value: "0x0",
      data: encodeFunctionData({
        abi: registryAbi,
        functionName: "setResolver",
        args: [BigInt(labelhash(label)), resolver],
      }),
      description: "Publish the configured resolver pointer last",
    },
  ],
});
