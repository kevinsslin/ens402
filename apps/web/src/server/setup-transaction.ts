import { ensClient } from "@ens402/server";
import { type Address, type Hex } from "viem";
export type SetupStep = { signer: string; to?: string; data: string; value?: string; description: string };
/** Simulate and estimate on our RPC before asking the wallet to sign. No submission here. */
export async function prepareSetupStep<T extends SetupStep>(step: T, client = ensClient()) {
  const request = { account: step.signer as Address, ...(step.to ? { to: step.to as Address } : {}), data: step.data as Hex, value: BigInt(step.value ?? "0") };
  const gas = await client.estimateGas(request);
  return { ...step, gas: (gas * 120n / 100n).toString() };
}
/** The browser can resume a known transaction without asking the wallet RPC. */
export async function setupReceipt(hash: string, client = ensClient()) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw Error("Invalid transaction hash");
  try {
    const receipt = await client.getTransactionReceipt({ hash: hash as Hex });
    const [transaction, block] = await Promise.all([client.getTransaction({ hash: hash as Hex }), client.getBlock({ blockNumber: receipt.blockNumber })]);
    if (block.hash !== receipt.blockHash || transaction.blockHash !== receipt.blockHash) return { status: "pending" as const };
    return { status: receipt.status, hash: receipt.transactionHash, from: transaction.from, to: transaction.to, data: transaction.input, value: transaction.value.toString(), contractAddress: receipt.contractAddress };
  } catch (error) {
    // Workspace packages can load separate viem copies, so instanceof is unreliable.
    // Only explicit not-found errors mean pending; transport failures still propagate.
    if (error && typeof error === "object" && "name" in error &&
      ["TransactionReceiptNotFoundError", "TransactionNotFoundError", "BlockNotFoundError"].includes(String(error.name))) return { status: "pending" as const };
    throw error;
  }
}
