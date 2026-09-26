import {
  hashMessage,
  parseAbi,
  type PublicClient,
  type Hex,
  type Address,
} from "viem";
import { normalize } from "viem/ens";
import { NETWORK, sameAddress, type ServiceSnapshot } from "./index";

type RecipientClient = {
  getChainId(): Promise<number>;
  getCode(input: {
    address: Address;
    blockNumber: bigint;
  }): Promise<Hex | undefined>;
  getBlock(
    input: { blockTag: "latest" } | { blockNumber: bigint },
  ): Promise<{ number: bigint | null; hash: Hex | null; timestamp: bigint }>;
  readContract: PublicClient["readContract"];
};

/** A holder authorizes receiving on the payment chain; never authorizes outgoing token transfers. */
export function recipientControlMessage(
  name: string,
  owner: Address,
  validUntil: number,
): string {
  if (
    !sameAddress(owner, owner) ||
    !Number.isSafeInteger(validUntil) ||
    validUntil <= 0
  )
    throw new Error("Invalid recipient proof request");
  return [
    "ENS402 recipient control v1",
    `Service: ${normalize(name)}`,
    `ENS network: eip155:11155111`,
    `Payment network: ${NETWORK}`,
    `Recipient: ${owner.toLowerCase()}`,
    `Valid until: ${validUntil}`,
    "I confirm this address can receive and manage this service's payments on the payment network.",
  ].join("\n");
}

/**
 * EOA addresses use the same signing key across supported EVM chains. Code absence is an
 * eligibility check, not proof that someone currently holds the private key. Contract or
 * delegated accounts require an explicit message verified on the destination chain using
 * a direct ERC-1271 call. Rejection never falls back to EOA signature recovery. No bridge or EAC grant is used.
 */
export async function checkNameOwnerRecipient(
  ens: Pick<RecipientClient, "getChainId" | "getCode">,
  payment: RecipientClient,
  service: ServiceSnapshot & { owner: Address },
  now = Math.floor(Date.now() / 1000),
): Promise<NonNullable<ServiceSnapshot["recipientCheck"]>> {
  if (
    service.payment.version !== 3 ||
    !sameAddress(service.owner, service.payment.payTo)
  )
    throw new Error("Expected holder-derived recipient");
  if (
    (await ens.getChainId()) !== 11155111 ||
    (await payment.getChainId()) !== 84532
  )
    throw new Error("Recipient check requires Sepolia and Base Sepolia");
  if (
    !/^\d+$/.test(service.block) ||
    !Number.isSafeInteger(now) ||
    now - service.observedAt > 30 ||
    service.observedAt > now
  )
    throw new Error("Refresh the ENS owner observation");
  const head = await payment.getBlock({ blockTag: "latest" });
  if (
    head.number === null ||
    !head.hash ||
    Number(head.timestamp) > now + 30 ||
    now - Number(head.timestamp) > 180
  )
    throw new Error("Payment-chain RPC head is stale");
  const [sourceCode, targetCode] = await Promise.all([
    ens.getCode({ address: service.owner, blockNumber: BigInt(service.block) }),
    payment.getCode({ address: service.owner, blockNumber: head.number }),
  ]);
  const hasCode = (code: string | undefined) => !!code && code !== "0x";
  let method: NonNullable<ServiceSnapshot["recipientCheck"]>["method"] =
    "eoa-code-check";
  if (hasCode(sourceCode) || hasCode(targetCode)) {
    const proof = service.payment.controlProof;
    if (!hasCode(targetCode) || !proof || proof.validUntil <= now)
      throw new Error(
        "Contract name holder requires a deployed payment-chain wallet and valid destination control signature",
      );
    let valid = false;
    try {
      const result = await payment.readContract({
        address: service.owner,
        abi: parseAbi([
          "function isValidSignature(bytes32 hash,bytes signature) view returns(bytes4)",
        ]),
        functionName: "isValidSignature",
        args: [
          hashMessage(
            recipientControlMessage(
              service.name,
              service.owner,
              proof.validUntil,
            ),
          ),
          proof.signature,
        ],
        blockNumber: head.number,
      });
      valid = result.toLowerCase() === "0x1626ba7e";
    } catch {
      /* Reverts, malformed responses and RPC failures all prevent payment. */
    }
    if (!valid)
      throw new Error(
        "Destination-chain recipient control signature is invalid",
      );
    method = "destination-signature";
  }
  if ((await payment.getBlock({ blockNumber: head.number })).hash !== head.hash)
    throw new Error("Payment-chain reorganization during recipient check");
  return {
    address: service.owner.toLowerCase(),
    network: NETWORK,
    observedAt: now,
    ensBlock: service.block,
    paymentBlock: String(head.number),
    method,
  };
}
