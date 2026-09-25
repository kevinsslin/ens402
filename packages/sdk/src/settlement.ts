import { decodeEventLog, parseAbi, type Hex, type PublicClient } from 'viem';
import type { PaymentRequirements, SettleResponse } from '@x402/core/types';
import { NETWORK, USDC, sameAddress } from './index';
import type { PublicAuthorization } from './http';
const tokenEvents = parseAbi([
  'event Transfer(address indexed from,address indexed to,uint256 value)',
  'event AuthorizationUsed(address indexed authorizer,bytes32 indexed nonce)',
]);
/** Verify the exact token, payer, recipient, amount and nonce, not a merchant's success flag. */
export async function verifySettlement(client: Pick<PublicClient, 'getChainId' | 'waitForTransactionReceipt'>, settlement: SettleResponse, authorization: PublicAuthorization, requirement: PaymentRequirements): Promise<void> {
  if (await client.getChainId() !== 84532 || settlement.network !== NETWORK || !settlement.success || !sameAddress(requirement.asset, USDC)) throw new Error('Unsupported settlement network or token');
  const receipt = await client.waitForTransactionReceipt({ hash: settlement.transaction as Hex, confirmations: 1, timeout: 30000 });
  if (receipt.status !== 'success') throw new Error('Settlement transaction reverted');
  let transferred = false; let used = false;
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, requirement.asset)) continue;
    try {
      const event = decodeEventLog({ abi: tokenEvents, data: log.data, topics: log.topics });
      if (event.eventName === 'Transfer' && sameAddress(event.args.from, authorization.from) && sameAddress(event.args.to, requirement.payTo) && event.args.value === BigInt(requirement.amount)) transferred = true;
      if (event.eventName === 'AuthorizationUsed' && sameAddress(event.args.authorizer, authorization.from) && event.args.nonce.toLowerCase() === authorization.nonce.toLowerCase()) used = true;
    } catch { /* Other USDC events do not prove payment. */ }
  }
  if (!transferred || !used) throw new Error('Receipt does not prove this payment authorization');
}
