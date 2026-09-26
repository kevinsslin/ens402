import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { privateKeyToAccount } from "viem/accounts";
import { NETWORK, USDC } from "@ens402/sdk";
import type { ResolvedService } from "@ens402/sdk/ens";
import {
  createApproval,
  executePurchase,
  getStore,
  revokeApproval,
  resumeApproval,
} from "../src/index";
import { serveMerchant } from "../src/merchant";
const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const recipient = "0x2222222222222222222222222222222222222222";
const endpoint = "https://merchant.example/api/merchant/search";
const policies = new Map<string, unknown>();
let signCalls = 0,
  settleCalls = 0,
  scanFailure = false,
  changedRecipient = false,
  changedAuthority = false;
const service = (): ResolvedService => ({
  name: "search.example.eth",
  endpoint,
  status: "active",
  authority: changedAuthority ? "changed" : "fixture",
  block: "123",
  observedAt: Math.floor(Date.now() / 1000),
  payment: {
    version: 1,
    scheme: "exact",
    network: NETWORK,
    asset: USDC,
    payTo: changedRecipient ? account.address : recipient,
  },
  resolver: recipient,
  implementation: recipient,
  owner: recipient,
  parentRegistry: recipient,
  blockHash: `0x${"00".repeat(32)}`,
  recordVersion: "0",
  authorityCoverage: [],
});
vi.mock("@ens402/sdk/ens", async (original) => ({
  ...(await original<typeof import("@ens402/sdk/ens")>()),
  resolveService: vi.fn(async () => service()),
}));
vi.mock("@ens402/sdk/settlement", () => ({
  verifySettlement: vi.fn(async () => {}),
}));
vi.mock("../src/transport", () => ({
  createResourceTransport: () => async (url: string, init: RequestInit) =>
    serveMerchant(new Request(url, init)),
}));
vi.mock("@ens402/sdk/intercepta", () => ({
  InterceptaProvider: class {
    async screen(address: string) {
      if (scanFailure) throw new Error("simulated provider outage");
      const now = Math.floor(Date.now() / 1000);
      return {
        provider: "intercepta",
        network: "ethereum-mainnet",
        address,
        observedAt: now,
        expiresAt: now + 3600,
        cached: false,
        scan: { toxicScore: 0, traits: [] },
      };
    }
  },
}));
vi.mock("@x402/core/http", async (original) => ({
  ...(await original<typeof import("@x402/core/http")>()),
  HTTPFacilitatorClient: class {
    async verify() {
      return { isValid: true, payer: account.address };
    }
    async settle() {
      settleCalls++;
      return {
        success: true,
        payer: account.address,
        network: NETWORK,
        transaction: `0x${"ab".repeat(32)}`,
      };
    }
  },
}));
vi.mock("@privy-io/node", () => ({
  PrivyClient: class {
    policies() {
      return {
        create: async (input: {
          idempotency_key: string;
          rules: unknown[];
        }) => {
          const id = input.idempotency_key;
          policies.set(id, input);
          return { id, ...input };
        },
        get: async (id: string) => policies.get(id),
        update: async (id: string, input: unknown) => {
          policies.set(id, input);
          return input;
        },
      };
    }
    wallets() {
      return {
        create: async (input: {
          idempotency_key: string;
          policy_ids: string[];
        }) => ({
          id: input.idempotency_key,
          address: account.address,
          policy_ids: input.policy_ids,
        }),
        get: async (id: string) => ({
          id,
          address: account.address,
          policy_ids: [id.replace(/-wallet$/, "-policy")],
        }),
        ethereum: () => ({
          signTypedData: async (
            _id: string,
            input: { params: { typed_data: Record<string, unknown> } },
          ) => {
            signCalls++;
            const d = input.params.typed_data;
            return {
              signature: await account.signTypedData({
                domain: d.domain,
                types: d.types,
                primaryType: d.primary_type,
                message: d.message,
              } as Parameters<typeof account.signTypedData>[0]),
            };
          },
        }),
      };
    }
  },
}));
const exec = promisify(execFile);
let directory: string,
  started = false;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "ens402-flow-pg-"));
  const listener = createServer();
  await new Promise<void>((r) => listener.listen(0, "127.0.0.1", r));
  const port = (listener.address() as { port: number }).port;
  await new Promise<void>((r) => listener.close(() => r()));
  await exec("initdb", [
    "-D",
    join(directory, "data"),
    "-U",
    "ens402_test",
    "-A",
    "trust",
    "--no-locale",
  ]);
  await exec("pg_ctl", [
    "-D",
    join(directory, "data"),
    "-l",
    join(directory, "postgres.log"),
    "-o",
    `-h 127.0.0.1 -p ${port} -k ${directory}`,
    "-w",
    "start",
  ]);
  started = true;
  Object.assign(process.env, {
    DATABASE_URL: `postgresql://ens402_test@127.0.0.1:${port}/postgres`,
    PRIVY_APP_ID: "test-app",
    PRIVY_APP_SECRET: "test-secret",
    INTERCEPTA_API_KEY: "test-key",
    SERVICE_ENS_NAME: "search.example.eth",
    MERCHANT_ALLOWED_ORIGINS: "https://merchant.example",
    MERCHANT_RESOURCE_URL: endpoint,
    MERCHANT_PAY_TO: recipient,
    SEPOLIA_RPC_URL: "https://rpc.example",
    BASE_SEPOLIA_RPC_URL: "https://rpc.example",
  });
  await getStore().migrate();
}, 60000);
afterAll(async () => {
  await getStore().close();
  if (started)
    await exec("pg_ctl", [
      "-D",
      join(directory, "data"),
      "-m",
      "fast",
      "-w",
      "stop",
    ]);
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function approve() {
  return createApproval({
    id: randomUUID(),
    name: "search.example.eth",
    authority: "fixture",
    payTo: recipient,
    endpoints: [endpoint],
    maxAmount: "10000",
    dailyLimit: "100000",
    durationSeconds: 3600,
  });
}
describe("server orchestration with real PostgreSQL and simulated external providers", () => {
  it("approves, provisions a constrained wallet, pays the merchant and persists the decision", async () => {
    const row = await approve();
    expect(row.state).toBe("active");
    const id = randomUUID();
    const execution = await executePurchase({ id, approvalId: row.id });
    expect(execution.state).toBe("settled");
    expect(execution.receipt?.resource).toContain("paid ENS402 sample");
    expect(
      execution.receipt?.steps.some((s) => s.stage === "resolve-again"),
    ).toBe(true);
    const signatures = signCalls,
      settlements = settleCalls;
    expect((await executePurchase({ id, approvalId: row.id })).state).toBe(
      "settled",
    );
    expect(signCalls).toBe(signatures);
    expect(settleCalls).toBe(settlements);
  });
  it("resumes provisioning within the same approval and refuses expired retry keys", async () => {
    const row = await approve();
    await getStore().pool.query(
      "UPDATE ens402_approvals SET state='provisioning' WHERE id=$1",
      [row.id],
    );
    const resumed = await resumeApproval(row.id);
    expect(resumed.wallet_id).toBe(row.wallet_id);
    await getStore().pool.query(
      "UPDATE ens402_approvals SET state='provisioning',created_at=now()-interval '24 hours' WHERE id=$1",
      [row.id],
    );
    await expect(resumeApproval(row.id)).rejects.toThrow("window expired");
  });
  it("holds before signing when screening fails", async () => {
    const row = await approve(),
      before = signCalls;
    scanFailure = true;
    try {
      expect(
        (await executePurchase({ id: randomUUID(), approvalId: row.id })).state,
      ).toBe("held");
      expect(signCalls).toBe(before);
    } finally {
      scanFailure = false;
    }
  });
  it("holds ownership changes and never silently expands buyer approval", async () => {
    const row = await approve(),
      before = signCalls;
    changedAuthority = true;
    try {
      expect(
        (await executePurchase({ id: randomUUID(), approvalId: row.id })).state,
      ).toBe("held");
      expect(signCalls).toBe(before);
    } finally {
      changedAuthority = false;
    }
  });
  it("rejects recipient rotation under the previous approval", async () => {
    const row = await approve(),
      before = signCalls;
    changedRecipient = true;
    try {
      expect(
        (await executePurchase({ id: randomUUID(), approvalId: row.id })).state,
      ).toBe("rejected");
      expect(signCalls).toBe(before);
    } finally {
      changedRecipient = false;
    }
  });
  it("blocks a wallet whose provider policy has been widened", async () => {
    const row = await approve(),
      before = signCalls;
    policies.set(row.policy_id!, {
      rules: [{ method: "*", action: "ALLOW", conditions: [] }],
    });
    expect(
      (await executePurchase({ id: randomUUID(), approvalId: row.id })).state,
    ).toBe("held");
    expect(signCalls).toBe(before);
  });
  it("revokes both future backend purchases and the provider policy", async () => {
    const row = await approve();
    await revokeApproval(row.id);
    expect((await getStore().getApproval(row.id)).state).toBe("revoked");
    await expect(
      executePurchase({ id: randomUUID(), approvalId: row.id }),
    ).rejects.toThrow("inactive");
  });
  it("serves an unpaid 402 and rejects an invalid signature without settlement", async () => {
    expect((await serveMerchant(new Request(endpoint))).status).toBe(402);
    const before = settleCalls;
    expect(
      (
        await serveMerchant(
          new Request(endpoint, {
            headers: { "PAYMENT-SIGNATURE": "invalid" },
          }),
        )
      ).status,
    ).toBe(402);
    expect(settleCalls).toBe(before);
  });
});

import { platformAction, authenticate, type Principal } from "../src/platform";
const userA: Principal = { kind: "user", ownerId: "did:privy:test-a" };
const userB: Principal = { kind: "user", ownerId: "did:privy:test-b" };
async function ownedApproval(
  owner = userA,
  mode: "hosted" | "self" = "hosted",
) {
  return platformAction(owner, {
    action: "approve",
    id: randomUUID(),
    mode,
    payer: account.address,
    name: "search.example.eth",
    authority: "fixture",
    payTo: recipient,
    endpoints: [endpoint],
    maxAmount: "10000",
    dailyLimit: "100000",
    durationSeconds: 3600,
  }) as ReturnType<typeof createApproval>;
}
describe("tenant isolation, scoped agent credentials and external signing", () => {
  it("isolates reads and rejects cross-user access to all approval mutations", async () => {
    const row = await ownedApproval();
    const other = (await platformAction(userB, { action: "state" })) as {
      approvals: { id: string }[];
    };
    expect(other.approvals.some((a) => a.id === row.id)).toBe(false);
    for (const action of ["balance", "resume-approval", "revoke"])
      await expect(
        platformAction(userB, { action, id: row.id }),
      ).rejects.toThrow("not found");
    await expect(
      platformAction(userB, {
        action: "execute",
        id: randomUUID(),
        approvalId: row.id,
      }),
    ).rejects.toThrow("not found");
    await expect(
      platformAction(userB, {
        action: "create-key",
        approvalId: row.id,
        label: "steal",
      }),
    ).rejects.toThrow("not found");
  });
  it("binds idempotency keys to the owning account", async () => {
    const row = await ownedApproval();
    await expect(
      createApproval(
        {
          id: row.id,
          name: row.approval.name,
          authority: "fixture",
          payTo: recipient,
          endpoints: [endpoint],
          maxAmount: "10000",
          dailyLimit: "100000",
          durationSeconds: 3600,
        },
        userB.ownerId,
      ),
    ).rejects.toThrow("Idempotency");
  });
  it("stores only a token hash, restricts keys to one approval, and revokes them", async () => {
    const row = await ownedApproval(),
      other = await ownedApproval();
    const key = (await platformAction(userA, {
      action: "create-key",
      approvalId: row.id,
      label: "weather-agent",
    })) as { id: string; token: string };
    const stored = await getStore().pool.query(
      "SELECT token_hash FROM ens402_agent_keys WHERE id=$1",
      [key.id],
    );
    expect(stored.rows[0].token_hash).not.toBe(key.token);
    const agent = await authenticate(`Bearer ${key.token}`);
    for (const action of ["state", "approve", "create-key", "revoke"])
      await expect(
        platformAction(agent, { action, id: row.id, approvalId: row.id }),
      ).rejects.toThrow("user login");
    await expect(
      platformAction(agent, {
        action: "execute",
        id: randomUUID(),
        approvalId: other.id,
      }),
    ).rejects.toThrow("does not cover");
    await expect(
      platformAction(userB, { action: "revoke-key", id: key.id }),
    ).rejects.toThrow("not found");
    await platformAction(userA, { action: "revoke-key", id: key.id });
    await expect(authenticate(`Bearer ${key.token}`)).rejects.toThrow(
      "revoked",
    );
  });
  it("creates no Privy wallet for self signing and settles only the prepared signature once", async () => {
    const row = await ownedApproval(userA, "self"),
      before = signCalls,
      id = randomUUID();
    expect(row.wallet_id).toBeNull();
    expect(row.state).toBe("active");
    const first = (await platformAction(userA, {
      action: "prepare-external",
      id,
      approvalId: row.id,
    })) as {
      prepared: { typedData: Parameters<typeof account.signTypedData>[0] };
    };
    const second = (await platformAction(userA, {
      action: "prepare-external",
      id,
      approvalId: row.id,
    })) as typeof first;
    expect(second.prepared).toEqual(first.prepared);
    await expect(
      platformAction(userB, {
        action: "submit-external",
        id,
        signature: `0x${"00".repeat(65)}`,
      }),
    ).rejects.toThrow("not found");
    const signature = await account.signTypedData(first.prepared.typedData);
    const result = (await platformAction(userA, {
      action: "submit-external",
      id,
      signature,
    })) as { state: string };
    expect(result.state).toBe("settled");
    expect(signCalls).toBe(before);
    const count = settleCalls;
    expect(
      await platformAction(userA, { action: "submit-external", id, signature }),
    ).toMatchObject({ state: "settled" });
    expect(settleCalls).toBe(count);
  });
  it("records both recipients when external signing is blocked before a signature", async () => {
    const row = await ownedApproval(userA, "self");
    changedRecipient = true;
    try {
      const result = (await platformAction(userA, {
        action: "prepare-external",
        id: randomUUID(),
        approvalId: row.id,
      })) as unknown as {
        state: string;
        prepared?: unknown;
        receipt: {
          service: ResolvedService;
          offeredRequirements: { payTo: string }[];
        };
      };
      expect(result.state).toBe("rejected");
      expect(result.prepared).toBeFalsy();
      expect(result.receipt.service.payment.payTo).toBe(account.address);
      expect(result.receipt.offeredRequirements[0]!.payTo).toBe(recipient);
    } finally {
      changedRecipient = false;
    }
  });
  it("rejects wrong-wallet signatures and ENS rotation after external preparation", async () => {
    const row = await ownedApproval(userA, "self"),
      id = randomUUID();
    const prepared = (await platformAction(userA, {
      action: "prepare-external",
      id,
      approvalId: row.id,
    })) as {
      prepared: { typedData: Parameters<typeof account.signTypedData>[0] };
    };
    const other = privateKeyToAccount(`0x${"33".repeat(32)}`);
    await expect(
      platformAction(userA, {
        action: "submit-external",
        id,
        signature: await other.signTypedData(prepared.prepared.typedData),
      }),
    ).rejects.toThrow("Signature");
    changedRecipient = true;
    try {
      await expect(
        platformAction(userA, {
          action: "submit-external",
          id,
          signature: await account.signTypedData(prepared.prepared.typedData),
        }),
      ).rejects.toThrow("changed");
    } finally {
      changedRecipient = false;
    }
    expect((await getStore().getExecution(id)).state).toBe("reserved");
    await platformAction(userA, { action: "cancel", id });
  });
  it("blocks external submission after approval revocation", async () => {
    const row = await ownedApproval(userA, "self"),
      id = randomUUID();
    const p = (await platformAction(userA, {
      action: "prepare-external",
      id,
      approvalId: row.id,
    })) as {
      prepared: { typedData: Parameters<typeof account.signTypedData>[0] };
    };
    await platformAction(userA, { action: "revoke", id: row.id });
    await expect(
      platformAction(userA, {
        action: "submit-external",
        id,
        signature: await account.signTypedData(p.prepared.typedData),
      }),
    ).rejects.toThrow("revoked");
  });
});

import { serveRegistration } from "../src/registration-merchant";
let registrations = 0;
vi.mock("../src/registration", async (original) => ({
  ...(await original<typeof import("../src/registration")>()),
  nativeRegistrationGateway: () => ({
    parent: "ens402.eth",
    registry: recipient,
    expiry: "2000000000",
    preflight: async () => {},
    fulfill: async (order: {
      orderId: string;
      label: string;
      recipient: string;
    }) => {
      registrations++;
      const result = {
        name: `${order.label}.ens402.eth`,
        owner: order.recipient,
        transaction: `0x${"cd".repeat(32)}`,
      };
      await getStore().finishRegistration(order.orderId, result);
      return result;
    },
  }),
}));
import { preparePayment } from "@ens402/sdk/x402";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import { requestNonce } from "@ens402/sdk/request";
describe("paid registration lifecycle with real ledger and simulated chains", () => {
  it("registers the chosen recipient once and replays without a second settlement", async () => {
    process.env.ENS_REGISTRATION_RESOURCE_URL =
      "https://merchant.example/api/merchant/register";
    const url = process.env.ENS_REGISTRATION_RESOURCE_URL;
    const body = JSON.stringify({
      orderId: randomUUID(),
      label: "gift-alice",
      recipient: recipient,
    });
    const initial = await serveRegistration(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );
    expect(initial.status).toBe(402);
    const { decodePaymentRequiredHeader } = await import("@x402/core/http");
    const challenge = decodePaymentRequiredHeader(
      initial.headers.get("payment-required")!,
    );
    const snapshot = { ...service(), endpoint: url };
    const approval = {
      name: snapshot.name,
      authority: snapshot.authority,
      endpoints: [url],
      payTo: recipient,
      maxAmount: "10000",
      expiresAt: Math.floor(Date.now() / 1000) + 600,
    };
    const prepared = await preparePayment({
      service: snapshot,
      requestUrl: url,
      request: { method: "POST", body },
      requirement: challenge.accepts[0]!,
      approval,
      signer: account,
      screen: async (address) => ({
        provider: "intercepta",
        network: "ethereum-mainnet",
        address,
        observedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        cached: false,
        scan: { toxicScore: 0, traits: [] },
      }),
    });
    const payload = {
      x402Version: 2,
      resource: { url },
      accepted: challenge.accepts[0]!,
      payload: prepared.payload!.payload,
    };
    const signed = encodePaymentSignatureHeader(payload);
    const before = settleCalls;
    const tampered = await serveRegistration(
      new Request(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "payment-signature": signed,
        },
        body: body.replace("gift-alice", "gift-bob"),
      }),
    );
    expect(tampered.status).toBe(402);
    expect(settleCalls).toBe(before);
    const send = () =>
      serveRegistration(
        new Request(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "payment-signature": signed,
          },
          body,
        }),
      );
    const result = await send();
    expect(result.status).toBe(200);
    expect((await result.json()).owner).toBe(recipient);
    expect((await send()).status).toBe(200);
    expect(settleCalls).toBe(before + 1);
    expect(registrations).toBe(1);
    const row = await getStore().registrationOrder(JSON.parse(body).orderId);
    expect(row.state).toBe("fulfilled");
    expect(row.payment_authorization.nonce).toBe(
      requestNonce(url, { method: "POST", body }),
    );
  });
  it("rejects invalid recipients and labels before asking for payment", async () => {
    for (const order of [
      { orderId: randomUUID(), label: "../bad", recipient },
      {
        orderId: randomUUID(),
        label: "alice",
        recipient: "0x" + "0".repeat(40),
      },
    ])
      expect(
        (
          await serveRegistration(
            new Request("https://merchant.example/api/merchant/register", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(order),
            }),
          )
        ).status,
      ).toBe(400);
  });
});
