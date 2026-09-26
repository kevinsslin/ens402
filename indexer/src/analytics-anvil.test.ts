import { it, expect } from "vitest";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Hex,
  type PublicClient,
} from "viem";
import { baseSepolia } from "viem/chains";
import { USDC } from "../../packages/sdk/src/index";
import { scanAnalytics } from "./analytics";
import type {
  AnalyticsStore,
  AnalyticsTransfer,
} from "../../packages/server/src/analytics";
const exec = promisify(execFile);
it("reads actual finalized Transfer receipts from a disposable Anvil token event fixture", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ens402-analytics-anvil-"));
  let node: ReturnType<typeof spawn> | undefined;
  try {
    await mkdir(join(dir, "src"));
    await writeFile(
      join(dir, "foundry.toml"),
      '[profile.default]\nsolc_version="0.8.30"\nevm_version="cancun"\n',
    );
    await writeFile(
      join(dir, "src/Emitter.sol"),
      "pragma solidity 0.8.30; contract Emitter { event Transfer(address indexed from,address indexed to,uint256 value); function emitTransfer(address from,address to,uint256 value) external { emit Transfer(from,to,value); } }",
    );
    await exec("forge", ["build", "--root", dir, "--quiet"]);
    const artifact = JSON.parse(
      await readFile(join(dir, "out/Emitter.sol/Emitter.json"), "utf8"),
    );
    const socket = createServer();
    await new Promise<void>((r) => socket.listen(0, "127.0.0.1", r));
    const port = (socket.address() as { port: number }).port;
    await new Promise<void>((r) => socket.close(() => r()));
    node = spawn(
      "anvil",
      ["--port", String(port), "--chain-id", "84532", "--silent"],
      { stdio: "ignore" },
    );
    const client = createPublicClient({
      chain: baseSepolia,
      transport: http(`http://127.0.0.1:${port}`),
    });
    const wallet = createWalletClient({
      chain: baseSepolia,
      transport: http(`http://127.0.0.1:${port}`),
    });
    for (let n = 0; ; n++) {
      try {
        await client.getChainId();
        break;
      } catch {
        if (n > 50) throw Error("Anvil startup failed");
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    const [account] = await wallet.getAddresses();
    const recipient = `0x${"7".repeat(40)}` as const;
    await client.request({
      method: "anvil_setCode" as never,
      params: [USDC, artifact.deployedBytecode.object] as never,
    });
    const tx = await wallet.writeContract({
      account: account!,
      address: USDC,
      abi: parseAbi(["function emitTransfer(address,address,uint256)"]),
      functionName: "emitTransfer",
      args: [account!, recipient, 9007199254740993n],
    });
    const receipt = await client.waitForTransactionReceipt({ hash: tx });
    await client.request({
      method: "anvil_mine" as never,
      params: ["0x80"] as never,
    });
    const rows: AnalyticsTransfer[] = [];
    const store = {
      checkpoints: async () => [],
      addresses: async () => [recipient],
      ingest: async (batch: AnalyticsTransfer[]) => {
        rows.push(...batch);
      },
    } as unknown as AnalyticsStore;
    await scanAnalytics(client as unknown as PublicClient, store, {
      fromBlock: receipt.blockNumber,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amountAtomic).toBe("9007199254740993");
    expect(rows[0]?.classification).toBe("unclassified");
    expect(rows[0]?.transactionHash).toBe(tx);
  } finally {
    node?.kill("SIGTERM");
    await rm(dir, { recursive: true, force: true });
  }
}, 60000);
