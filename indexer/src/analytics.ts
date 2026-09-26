import {
  decodeEventLog,
  keccak256,
  parseAbi,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  NETWORK,
  USDC,
  sameAddress,
  validAmount,
} from "../../packages/sdk/src/index";
import {
  currentDeployment,
  currentRegistryAbi,
} from "../../packages/sdk/src/ens/current";
import { verifySettlement } from "../../packages/sdk/src/settlement";
import type { PublicAuthorization } from "../../packages/sdk/src/http";
import type { PaymentRequirements, SettleResponse } from "@x402/core/types";
import {
  AnalyticsStore,
  type AnalyticsTransfer,
} from "../../packages/server/src/analytics";
import type { Catalog } from "../../packages/server/src/discovery";
const transferAbi = parseAbi([
  "event Transfer(address indexed from,address indexed to,uint256 value)",
]);
export type FacilitatorList = {
  version: string;
  network: typeof NETWORK;
  addresses: Address[];
};
/** No facilitator addresses are guessed. Operators configure a reviewed, versioned list. */
export const emptyFacilitators: FacilitatorList = {
  version: "unconfigured-v1",
  network: NETWORK,
  addresses: [],
};
export async function analyticsIdentities(
  client: PublicClient,
  catalog: Catalog,
): Promise<Record<string, string>> {
  if ((await client.getChainId()) !== 11155111 || !catalog.checkpoint)
    throw new Error("Sepolia checkpoint required");
  const blockNumber = BigInt(catalog.checkpoint.blockNumber);
  if (
    (await client.getBlock({ blockNumber })).hash !==
    catalog.checkpoint.blockHash
  )
    throw new Error("ENS snapshot is no longer canonical");
  const result: Record<string, string> = {};
  for (const { service } of catalog.services) {
    let registry: Address = currentDeployment.rootRegistry;
    const lineage: string[] = [];
    for (const label of service.name.split(".").reverse()) {
      const owner = await client.readContract({
        address: registry,
        abi: currentRegistryAbi,
        functionName: "findOwner",
        args: [label],
        blockNumber,
      });
      if (owner === zeroAddress)
        throw new Error("Missing name control identity");
      lineage.push(registry.toLowerCase(), owner.toLowerCase());
      registry = await client.readContract({
        address: registry,
        abi: currentRegistryAbi,
        functionName: "getSubregistry",
        args: [label],
        blockNumber,
      });
    }
    result[service.name] = keccak256(stringToHex(lineage.join(":")));
  }
  return result;
}
/** Finalized-only scanner. Canonical checkpoint mismatch rewinds orphaned receipts before replay. */
export async function scanAnalytics(
  client: PublicClient,
  store: AnalyticsStore,
  options: {
    fromBlock: bigint;
    chunkSize?: bigint;
    maxChunks?: number;
    facilitators?: FacilitatorList;
  },
) {
  if ((await client.getChainId()) !== 84532)
    throw new Error("Analytics supports Base Sepolia only");
  const facilitators = options.facilitators ?? emptyFacilitators;
  if (
    facilitators.network !== NETWORK ||
    !facilitators.version ||
    facilitators.addresses.some((a) => !/^0x[0-9a-fA-F]{40}$/.test(a))
  )
    throw new Error("Invalid facilitator list");
  const finalized = await client.getBlock({ blockTag: "finalized" });
  const checkpoints = await store.checkpoints();
  let start = options.fromBlock;
  for (const checkpoint of checkpoints) {
    const blockNumber = BigInt(checkpoint.blockNumber);
    if (blockNumber > finalized.number) continue;
    if (
      (await client.getBlock({ blockNumber })).hash === checkpoint.blockHash
    ) {
      start = blockNumber + 1n;
      break;
    }
  }
  if (checkpoints.length && start <= BigInt(checkpoints[0]!.blockNumber))
    await store.rewind(start);
  const addresses = await store.addresses();
  const step = options.chunkSize ?? 1000n;
  if (start < 0n || step < 1n || step > 10000n)
    throw new Error("Invalid analytics scan interval");
  if (options.maxChunks !== undefined && (!Number.isInteger(options.maxChunks) || options.maxChunks < 1)) throw new Error("Invalid analytics chunk budget");
  let count = 0, chunks = 0;
  for (let from = start; from <= finalized.number; from += step) {
    if (options.maxChunks !== undefined && chunks++ >= options.maxChunks) break;
    const to =
      from + step - 1n < finalized.number ? from + step - 1n : finalized.number;
    const boundary = await client.getBlock({ blockNumber: to });
    if (!boundary.hash) throw new Error("Missing block hash");
    const rows: AnalyticsTransfer[] = [];
    for (let i = 0; i < addresses.length; i += 100) {
      const logs = await client.getLogs({
        address: USDC,
        event: transferAbi[0],
        args: { to: addresses.slice(i, i + 100) as Address[] },
        fromBlock: from,
        toBlock: to,
        strict: true,
      });
      for (const log of logs) {
        if (log.removed) continue;
        const receipt = await client.getTransactionReceipt({
          hash: log.transactionHash,
        });
        if (receipt.status !== "success" || receipt.blockHash !== log.blockHash)
          throw new Error("Receipt changed during analytics scan");
        const block = await client.getBlock({ blockNumber: log.blockNumber });
        if (block.hash !== log.blockHash)
          throw new Error("Reorganization during analytics scan");
        const transaction = await client.getTransaction({
          hash: log.transactionHash,
        });
        const known = facilitators.addresses.some((address) =>
          sameAddress(address, transaction.from),
        );
        rows.push({
          transactionHash: log.transactionHash,
          logIndex: log.logIndex,
          blockNumber: String(log.blockNumber),
          blockHash: log.blockHash,
          timestamp: Number(block.timestamp),
          from: log.args.from,
          to: log.args.to,
          amountAtomic: String(log.args.value),
          classification: known ? "facilitator" : "unclassified",
          ...(known ? { facilitatorVersion: facilitators.version } : {}),
        });
      }
    }
    if ((await client.getBlock({ blockNumber: to })).hash !== boundary.hash)
      throw new Error("Reorganization before analytics commit");
    await store.ingest(rows, {
      blockNumber: String(to),
      blockHash: boundary.hash,
    });
    count += rows.length;
  }
  return { observedTransfers: count, finalizedBlock: String(finalized.number) };
}
/** Trusted local payment evidence must bind exact amount/payer/payTo/nonce; no public proof submission. */
export async function verifyAnalyticsPayment(
  client: PublicClient,
  store: AnalyticsStore,
  input: {
    settlement: SettleResponse;
    authorization: PublicAuthorization;
    requirement: PaymentRequirements;
  },
) {
  if (
    input.requirement.scheme !== "exact" ||
    input.requirement.network !== NETWORK ||
    !sameAddress(input.authorization.to, input.requirement.payTo) ||
    !validAmount(input.requirement.amount) ||
    BigInt(input.requirement.amount) === 0n ||
    input.authorization.value !== input.requirement.amount ||
    !/^0x[0-9a-fA-F]{64}$/.test(input.authorization.nonce) ||
    (input.settlement.payer !== undefined &&
      !sameAddress(input.settlement.payer, input.authorization.from))
  )
    throw new Error("Local proof does not bind the expected payment");
  await verifySettlement(
    client,
    input.settlement,
    input.authorization,
    input.requirement,
  );
  const receipt = await client.getTransactionReceipt({
    hash: input.settlement.transaction as Hex,
  });
  const finalized = await client.getBlock({ blockTag: "finalized" });
  if (
    receipt.blockNumber > finalized.number ||
    (await client.getBlock({ blockNumber: receipt.blockNumber })).hash !==
      receipt.blockHash
  )
    throw new Error("Payment is not canonical and finalized");
  const matching = receipt.logs.filter((log) => {
    if (!sameAddress(log.address, USDC)) return false;
    try {
      const event = decodeEventLog({
        abi: transferAbi,
        data: log.data,
        topics: log.topics,
      });
      return (
        sameAddress(event.args.from, input.authorization.from) &&
        sameAddress(event.args.to, input.requirement.payTo) &&
        event.args.value === BigInt(input.requirement.amount)
      );
    } catch {
      return false;
    }
  });
  if (matching.length !== 1) throw new Error("Ambiguous settlement transfer");
  await store.markVerified({
    transactionHash: receipt.transactionHash,
    logIndex: matching[0]!.logIndex,
    blockHash: receipt.blockHash,
    nonce: input.authorization.nonce,
  });
}
