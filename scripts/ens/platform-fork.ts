import {
  planPlatform,
  type PlatformSetup,
} from "../../apps/web/src/server/platform-plan";
/** Disposable fork smoke test. Only localhost impersonated accounts sign. */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  zeroAddress,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { currentDeployment as d } from "../../packages/sdk/src/ens/current";
import { providerRoles, providerRegistryAbi } from "./provider-config";

const dir = await mkdtemp(`${tmpdir()}/ens402-provider-`);
const probe = createServer();
await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
const port = (probe.address() as { port: number }).port;
await new Promise<void>((resolve, reject) =>
  probe.close((error) => (error ? reject(error) : resolve())),
);
const node = spawn(
  "anvil",
  [
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--fork-url",
    process.env.ENS_FORK_RPC_URL || "https://sepolia.gateway.tenderly.co",
    "--fork-block-number",
    "11783987",
    "--no-storage-caching",
    "--silent",
  ],
  { stdio: "ignore" },
);
let exited = false;
node.on("exit", () => {
  exited = true;
});
node.on("error", () => {
  exited = true;
});
const transport = http(`http://127.0.0.1:${port}`);
const client = createPublicClient({ chain: sepolia, transport });
const wallet = createWalletClient({ chain: sepolia, transport });
const admin: Address = "0x0000000000000000000000000000000000001001";
const root: Address = "0x84d3a426d4e12e955d1df95db0b24fe26afe39d3";
try {
  for (let i = 0; ; i++) {
    try {
      if (exited) throw Error("Anvil exited");
      assert.equal(await client.getChainId(), 11155111);
      break;
    } catch {
      if (exited || i > 80) throw Error("Anvil not ready");
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  for (const address of [admin, root]) {
    await client.request({
      method: "anvil_impersonateAccount" as never,
      params: [address] as never,
    });
    await client.request({
      method: "anvil_setBalance" as never,
      params: [address, "0x3635c9adc5dea00000"] as never,
    });
  }
  const ethRegistry = await client.readContract({
    address: d.rootRegistry,
    abi: parseAbi(["function getSubregistry(string) view returns(address)"]),
    functionName: "getSubregistry",
    args: ["eth"],
  });
  await client.request({
    method: "anvil_impersonateAccount" as never,
    params: [d.ethRegistrar] as never,
  });
  await client.request({
    method: "anvil_setBalance" as never,
    params: [d.ethRegistrar, "0x3635c9adc5dea00000"] as never,
  });
  const block = await client.getBlock();
  await client.waitForTransactionReceipt({
    hash: await wallet.writeContract({
      account: d.ethRegistrar,
      address: ethRegistry,
      abi: providerRegistryAbi,
      functionName: "register",
      args: [
        "bootstrapfork402",
        admin,
        zeroAddress,
        zeroAddress,
        providerRoles.name,
        block.timestamp + 86400n * 30n,
      ],
    }),
  });
  process.env.ENS_PARENT_NAME = "bootstrapfork402.eth";
  let setup: PlatformSetup = {
    parent: "bootstrapfork402.eth",
    owner: admin,
    salt: "919109",
  };
  let plan = await planPlatform(setup, client);
  assert.equal(plan.stage, "deploy");
  assert.equal(plan.transactions.length, 1);
  const send = async (tx: (typeof plan.transactions)[number]) => {
    const hash = await wallet.sendTransaction({
      account: tx.signer,
      to: tx.to,
      data: tx.data,
      value: 0n,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    return hash;
  };
  const deploymentHash = await send(plan.transactions[0]!);
  setup = { ...plan.setup, deploymentHash };
  plan = await planPlatform(setup, client);
  assert.equal(plan.stage, "link");
  assert.equal(plan.transactions.length, 1);
  await send(plan.transactions[0]!);
  plan = await planPlatform(setup, client);
  assert.equal(plan.ready, true);
  assert.equal(plan.transactions.length, 0);
  await assert.rejects(
    planPlatform({ ...setup, registry: admin }, client),
    /refusing replacement/,
  );
  await assert.rejects(
    planPlatform({ ...setup, owner: root }, client),
    /current platform name owner/,
  );
  console.log(
    "PASS: native platform registry creation, exact deployment receipt validation, owner-signed link, resumable completion and replacement rejection",
  );
} finally {
  node.kill();
  await rm(dir, { recursive: true, force: true });
}
