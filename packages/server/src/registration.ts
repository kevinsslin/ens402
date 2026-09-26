import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import {
  currentDeployment,
  currentRegistryAbi,
  factoryAbi,
} from "@ens402/sdk/ens";
import { parseAbi } from "viem";
import { sameAddress } from "@ens402/sdk";
import { requireEnv } from "./config";
import { verifySettlement } from "@ens402/sdk/settlement";
import { baseClient } from "./index";
import { NETWORK } from "@ens402/sdk";
import { uuid } from "./config";
import { getStore } from "./index";

export type RegistrationOrder = {
  orderId: string;
  label: string;
  recipient: Address;
};
export function parseRegistrationOrder(body: string): RegistrationOrder {
  const order = JSON.parse(body);
  if (
    !order ||
    Object.keys(order).sort().join(",") !== "label,orderId,recipient" ||
    typeof order.label !== "string" ||
    !/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(order.label) ||
    typeof order.recipient !== "string" ||
    !sameAddress(order.recipient, order.recipient) ||
    sameAddress(order.recipient, zeroAddress) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      order.orderId,
    )
  )
    throw new Error(
      "Specify an orderId, a 3-32 character label and a nonzero recipient",
    );
  return {
    orderId: order.orderId.toLowerCase(),
    label: order.label,
    recipient: order.recipient.toLowerCase() as Address,
  };
}
export const purchaseRegistryAbi = parseAbi([
  "function register(string label,address owner,address registry,address resolver,uint256 roleBitmap,uint64 expiry) returns (uint256)",
  "function hasRootRoles(uint256 roleBitmap,address account) view returns (bool)",
]);
// Name-level control for the recipient. No resolver is created or retained by the merchant.
export const purchasedNameRoles =
  (1n << 20n) |
  (1n << 24n) |
  (((1n << 20n) | (1n << 24n) | (1n << 28n)) << 128n);
export function nativeRegistrationGateway() {
  const rpc = requireEnv("SEPOLIA_RPC_URL");
  const account = privateKeyToAccount(
    requireEnv("ENS_REGISTRATION_PRIVATE_KEY") as Hex,
  );
  const client = createPublicClient({
    chain: sepolia,
    transport: http(rpc, { timeout: 12000, retryCount: 0 }),
    ccipRead: false,
  });
  const wallet = createWalletClient({
    chain: sepolia,
    transport: http(rpc, { timeout: 12000, retryCount: 0 }),
    account,
  });
  const parent = normalize(requireEnv("ENS_PARENT_NAME"));
  const registry = requireEnv("ENS_PURCHASE_REGISTRY") as Address;
  const expiry = BigInt(requireEnv("ENS_PURCHASE_EXPIRY"));
  const data = (order: RegistrationOrder) =>
    encodeFunctionData({
      abi: purchaseRegistryAbi,
      functionName: "register",
      args: [
        order.label,
        order.recipient,
        zeroAddress,
        zeroAddress,
        purchasedNameRoles,
        expiry,
      ],
    });
  async function preflight(order: RegistrationOrder) {
    if (
      !parent ||
      !sameAddress(registry, registry) ||
      (await client.getChainId()) !== 11155111
    )
      throw new Error("Invalid registration deployment");
    const block = await client.getBlock();
    if (
      expiry <= block.timestamp + 86400n ||
      expiry > block.timestamp + 365n * 86400n
    )
      throw new Error("Registration expiry is outside supported limits");
    let cursor: Address = currentDeployment.rootRegistry;
    for (const label of parent.split(".").reverse()) {
      const owner = await client.readContract({
        address: cursor,
        abi: currentRegistryAbi,
        functionName: "findOwner",
        args: [label],
      });
      if (sameAddress(owner, zeroAddress))
        throw new Error("Parent is not active");
      cursor = await client.readContract({
        address: cursor,
        abi: currentRegistryAbi,
        functionName: "getSubregistry",
        args: [label],
      });
      if (sameAddress(cursor, zeroAddress))
        throw new Error("Parent namespace has not been enabled");
    }
    if (!sameAddress(cursor, registry))
      throw new Error("Configured registry is not the current parent registry");
    const implementation = await client.readContract({
      address: currentDeployment.factory,
      abi: factoryAbi,
      functionName: "verifyContract",
      args: [registry],
    });
    if (!sameAddress(implementation, currentDeployment.registryImplementation))
      throw new Error("Unsupported native registry");
    if (
      !(await client.readContract({
        address: registry,
        abi: purchaseRegistryAbi,
        functionName: "hasRootRoles",
        args: [1n, account.address],
      }))
    )
      throw new Error("Registration wallet lacks ROLE_REGISTRAR");
    if (
      !sameAddress(
        await client.readContract({
          address: registry,
          abi: currentRegistryAbi,
          functionName: "findOwner",
          args: [order.label],
        }),
        zeroAddress,
      )
    )
      throw new Error("Name is unavailable");
    const gas = await client.estimateGas({
      account: account.address,
      to: registry,
      data: data(order),
    });
    const fee = await client.getGasPrice();
    if (
      (await client.getBalance({ address: account.address })) <
      gas * fee * 2n
    )
      throw new Error("Registration wallet needs Sepolia gas");
    await client.call({
      account: account.address,
      to: registry,
      data: data(order),
    });
  }
  async function fulfill(order: RegistrationOrder) {
    const store = getStore();
    // Serialize this signer's nonce allocation across workers. Save the raw transaction before broadcast.
    const lock = await store.pool.connect();
    try {
      await lock.query("BEGIN");
      const acquired = await lock.query(
        "SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired",
        [`ens-registration:${account.address}`],
      );
      if (!acquired.rows[0].acquired)
        throw new Error(
          "Registration worker is busy; resume the paid order later",
        );
      const row = await store.registrationOrder(order.orderId);
      if (row?.state === "fulfilled") return row.result;
      if (!row || !row.settlement)
        throw new Error("Confirmed payment required");
      if (
        row.parent !== parent ||
        row.label !== order.label ||
        !sameAddress(row.recipient, order.recipient) ||
        !sameAddress(row.terms?.registry ?? "", registry) ||
        row.terms?.expiry !== expiry.toString()
      )
        throw new Error(
          "Registration terms changed; review the original order",
        );
      let raw = row.raw_transaction as Hex | undefined;
      if (!raw) {
        const pending = await lock.query(
          "SELECT id FROM ens402_registration_orders WHERE state='registering' AND raw_transaction IS NOT NULL AND id<>$1 LIMIT 1",
          [order.orderId],
        );
        if (pending.rowCount)
          throw new Error(
            "Resolve the pending registration transaction before allocating another nonce",
          );
        await preflight(order);
        const prepared = await wallet.prepareTransactionRequest({
          to: registry,
          data: data(order),
        });
        raw = await wallet.signTransaction(prepared);
        await store.saveRegistrationTransaction(
          order.orderId,
          raw,
          keccak256(raw),
        );
      }
      const hash = keccak256(raw);
      let receipt;
      try {
        receipt = await client.getTransactionReceipt({ hash });
      } catch {
        try {
          await client.sendRawTransaction({ serializedTransaction: raw });
        } catch {
          /* Only this identical transaction may be retried. */
        }
        receipt = await client.waitForTransactionReceipt({
          hash,
          timeout: 30000,
        });
      }
      if (receipt.status !== "success") {
        await store.pool.query(
          "UPDATE ens402_registration_orders SET state='registration_failed' WHERE id=$1",
          [order.orderId],
        );
        throw new Error(
          "Registration reverted; payment requires refund review",
        );
      }
      const owner = await client.readContract({
        address: registry,
        abi: currentRegistryAbi,
        functionName: "findOwner",
        args: [order.label],
      });
      if (!sameAddress(owner, order.recipient))
        throw new Error("Recipient ownership could not be confirmed");
      const result = {
        name: `${order.label}.${parent}`,
        owner,
        registry,
        transaction: hash,
        expiry: expiry.toString(),
        chainId: 11155111,
        resolver: null,
        note: "Native subname registered directly to recipient. No resolver or service configuration is included.",
      };
      await store.finishRegistration(order.orderId, result);
      return result;
    } finally {
      await lock.query("ROLLBACK").catch(() => {});
      lock.release();
    }
  }
  return { parent, registry, expiry: expiry.toString(), preflight, fulfill };
}

/** Operator recovery only. Confirm the original payment; never charge the buyer again. */
export async function recoverRegistration(id: string, transaction?: string) {
  const store = getStore(),
    row = await store.registrationOrder(uuid(id));
  if (!row) throw new Error("Order not found");
  if (!row.settlement) {
    if (
      !transaction ||
      !/^0x[0-9a-fA-F]{64}$/.test(transaction) ||
      !row.payment_authorization ||
      !row.requirement
    )
      throw new Error("Original Base Sepolia settlement transaction required");
    const settlement = {
      success: true,
      network: NETWORK,
      payer: row.payment_authorization.from,
      transaction,
    };
    await verifySettlement(
      baseClient(),
      settlement,
      row.payment_authorization,
      row.requirement,
    );
    await store.payRegistration(row.id, settlement);
  }
  return nativeRegistrationGateway().fulfill({
    orderId: row.id,
    label: row.label,
    recipient: row.recipient,
  });
}
