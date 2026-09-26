/** Produce a public, non-spending message for a contract name holder to sign on Base Sepolia. */
import { isAddress } from "viem";
import { recipientControlMessage } from "../packages/sdk/src/recipient";

const [name, owner, expiry] = process.argv.slice(2);
const validUntil = Number(expiry);
if (
  !name ||
  !owner ||
  !isAddress(owner) ||
  !Number.isSafeInteger(validUntil) ||
  validUntil <= Math.floor(Date.now() / 1000)
) {
  console.error(
    "Usage: tsx scripts/recipient-proof.ts <service ENS> <holder address> <future Unix expiry seconds>",
  );
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        message: recipientControlMessage(name, owner, validUntil),
        chainId: 84532,
        instruction:
          "Sign this exact message using the holder wallet on Base Sepolia. Add controlProof: {validUntil, signature} to its schema-v3 ens402.payment record using the authorized Treasury writer. Guard verifies the signature on Base Sepolia. This does not authorize spending.",
        validUntil,
      },
      null,
      2,
    ),
  );
}
