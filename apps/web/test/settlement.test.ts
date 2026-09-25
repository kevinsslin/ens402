import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, parseAbiItem, type Address, type Log } from 'viem';
import { BASE_SEPOLIA_USDC } from '@hufu402/sdk';
import { hasExactUsdcTransfer, verifySettlement } from '../src/lib/policy';

const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const payer = '0x1111111111111111111111111111111111111111' as const;
const payTo = '0x2222222222222222222222222222222222222222' as const;
const other = '0x3333333333333333333333333333333333333333' as const;
const intent = { payer, payTo, amountAtomic: '50000' };
const originalRpc = process.env.BASE_SEPOLIA_RPC_URL;

afterEach(() => {
  if (originalRpc === undefined) delete process.env.BASE_SEPOLIA_RPC_URL;
  else process.env.BASE_SEPOLIA_RPC_URL = originalRpc;
});

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
  it('rejects a receipt provider on another chain before requesting a transaction', async () => {
    const methods: string[] = [];
    const server = createServer(async (request, response) => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString()) as { id: number; method: string };
      methods.push(body.method);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x1' }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('RPC test server has no port');
      process.env.BASE_SEPOLIA_RPC_URL = `http://127.0.0.1:${address.port}`;
      expect(await verifySettlement(intent, `0x${'a'.repeat(64)}`)).toBe(false);
      expect(methods).toEqual(['eth_chainId']);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });

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
