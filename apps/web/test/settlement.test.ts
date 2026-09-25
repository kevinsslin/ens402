import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, parseAbiItem, type Address, type Log } from 'viem';
import { BASE_SEPOLIA_USDC } from '@hufu402/sdk';
import { hasExactUsdcTransfer } from '../src/lib/policy';

const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const payer = '0x1111111111111111111111111111111111111111' as const;
const payTo = '0x2222222222222222222222222222222222222222' as const;
const other = '0x3333333333333333333333333333333333333333' as const;
const intent = { payer, payTo, amountAtomic: '50000' };

function log(value: bigint, from: Address = payer, to: Address = payTo, address: Address = BASE_SEPOLIA_USDC) {
  const topics = encodeEventTopics({ abi: [transfer], eventName: 'Transfer', args: { from, to } });
  if (topics.some(topic => typeof topic !== 'string')) throw new Error('Transfer topics must be encoded');
  return {
    address,
    topics: topics as Log['topics'],
    data: encodeAbiParameters([{ type: 'uint256' }], [value]),
  };
}

describe('settlement receipt', () => {
  it('credits only the exact USDC transfer in the signed payment intent', () => {
    expect(hasExactUsdcTransfer(intent, [log(50000n)])).toBe(true);
    expect(hasExactUsdcTransfer(intent, [log(50001n)])).toBe(false);
    expect(hasExactUsdcTransfer(intent, [log(49999n)])).toBe(false);
    expect(hasExactUsdcTransfer(intent, [log(50000n, other)])).toBe(false);
    expect(hasExactUsdcTransfer(intent, [log(50000n, payer, other)])).toBe(false);
    expect(hasExactUsdcTransfer(intent, [log(50000n, payer, payTo, other)])).toBe(false);
    expect(hasExactUsdcTransfer(intent, [log(50000n), log(50000n)])).toBe(false);
    expect(hasExactUsdcTransfer(intent, [log(50000n), log(1n, payer, other)])).toBe(false);
    expect(hasExactUsdcTransfer(intent, [log(50000n), log(1n, other, payTo)])).toBe(true);
  });
});
