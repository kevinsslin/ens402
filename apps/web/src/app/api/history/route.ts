import { NextResponse } from 'next/server';
import { createPublicClient, getAddress, http, namehash, parseAbiItem } from 'viem';
import { sepolia } from 'viem/chains';
import {
  BASE_SEPOLIA_COIN_TYPE, createEnsClient, resolveServiceAuthority,
} from '@hufu402/sdk';

export const runtime = 'nodejs';
const addressChanged = parseAbiItem('event AddressChanged(bytes32 indexed node, uint256 coinType, bytes newAddress)');
const blockWindow = 25_000n;
const chunkSize = 5_000n;

export async function GET(request: Request) {
  try {
    const name = new URL(request.url).searchParams.get('name');
    if (!name || name.length > 255) throw new Error('ENS service name required');
    const rpc = process.env.SEPOLIA_RPC_URL;
    if (!rpc) throw new Error('SEPOLIA_RPC_URL is required');
    const authority = await resolveServiceAuthority(createEnsClient(rpc), name);
    const client = createPublicClient({ chain: sepolia, transport: http(rpc, { timeout: 10000 }) });
    const toBlock = await client.getBlockNumber();
    const fromBlock = toBlock > blockWindow ? toBlock - blockWindow : 0n;
    const ranges: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
    for (let start = fromBlock; start <= toBlock; start += chunkSize) {
      ranges.push({ fromBlock: start, toBlock: start + chunkSize - 1n < toBlock ? start + chunkSize - 1n : toBlock });
    }
    const batches = await Promise.all(ranges.map(range => client.getLogs({
      address: authority.resolver,
      event: addressChanged,
      args: { node: namehash(authority.name) },
      ...range,
    })));
    const events = batches.flat().filter(log => log.args.coinType === BASE_SEPOLIA_COIN_TYPE)
      .sort((a, b) => Number(b.blockNumber - a.blockNumber) || Number(b.logIndex - a.logIndex))
      .slice(0, 20)
      .map(log => ({
        blockNumber: log.blockNumber.toString(),
        transactionHash: log.transactionHash,
        payTo: log.args.newAddress?.length === 42 ? getAddress(log.args.newAddress) : null,
      }));
    return NextResponse.json({ events, fromBlock: fromBlock.toString(), toBlock: toBlock.toString(), complete: fromBlock === 0n }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'History lookup failed' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
