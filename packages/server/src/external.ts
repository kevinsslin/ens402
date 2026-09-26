import { canonicalMetadata, verifyChallengeMetadata } from "@ens402/sdk/metadata";
import {
  requestNonce,
  validateResourceRequest,
  type ResourceRequest,
} from "@ens402/sdk/request";
import { randomBytes } from "node:crypto";
import { verifyTypedData, type Address, type Hex } from "viem";
import { authorizationTypes } from "@x402/evm";
import { NETWORK, USDC, evaluateRisk, verifyRequest } from "@ens402/sdk";
import {
  parseChallenge,
  submitResourcePayment,
  type PaymentReceipt,
  type PublicAuthorization,
} from "@ens402/sdk/http";
import { verifySettlement } from "@ens402/sdk/settlement";
import { getStore, inspectService, screenRecipient, baseClient } from "./index";
import { uuid } from "./config";
import { createResourceTransport } from "./transport";

export type ExternalPreparation = {
  typedData: {
    domain: {
      name: "USDC";
      version: "2";
      chainId: 84532;
      verifyingContract: typeof USDC;
    };
    types: typeof authorizationTypes;
    primaryType: "TransferWithAuthorization";
    message: PublicAuthorization;
  };
  receipt: PaymentReceipt;
};
export async function prepareExternal(input: Record<string, unknown>) {
  const request = input.request
    ? validateResourceRequest(input.request as ResourceRequest)
    : undefined;
  const id = uuid(input.id),
    approvalId = uuid(input.approvalId),
    store = getStore();
  const row = await store.getApproval(approvalId);
  if (row.mode !== "self" || !row.payer)
    throw new Error("External signer approval required");
  const reserved = await store.reserve(
    id,
    approvalId,
    Math.floor(Date.now() / 1000),
  );
  if (!reserved.created) return reserved.execution;
  const progress: PaymentReceipt = { state: "held", reason: "Preparing payment", steps: [] };
  let stage: "resolve" | "approval" | "challenge" | "metadata" | "screen" | "prepare" = "resolve";
  try {
    const service = await inspectService(row.approval.name);
    progress.service = service;
    progress.steps.push({ stage: "resolve", detail: `Read ${service.name} at block ${service.block}` });
    stage = "approval";
    if (
      service.authority !== row.approval.authority ||
      service.status !== "active" ||
      !row.approval.endpoints.includes(service.endpoint)
    )
      throw new Error("Service requires approval");
    stage = "challenge";
    const transport = createResourceTransport([
      new URL(service.endpoint).origin,
    ]);
    const response = await transport(service.endpoint, {
      method: request?.method ?? "GET",
      body: request?.body,
      headers: {
        Accept: "application/json",
        ...(request ? { "Content-Type": "application/json" } : {}),
      },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    let challenge;
    try {
      if (response.status !== 402) throw new Error("Expected HTTP 402");
      challenge = parseChallenge(
        response.headers.get("payment-required"),
        service.endpoint,
      );
    } finally {
      await response.body?.cancel();
    }
    progress.offeredRequirements = challenge.accepts;
    stage = "metadata";
    let now = Math.floor(Date.now() / 1000);
    verifyChallengeMetadata(service, challenge, request?.method ?? "GET", row.approval.metadataHash);
    const requirement = challenge.accepts.find(
      (r) =>
        verifyRequest(service, service.endpoint, r, row.approval, now)
          .outcome === "continue",
    );
    if (!requirement)
      return store.finish(id, {
        state: "rejected",
        reason: "No offered payment matches ENS and buyer approval",
        service,
        offeredRequirements: challenge.accepts,
        steps: [
          {
            stage: "resolve",
            detail: `Read ${service.name} at block ${service.block}`,
          },
          {
            stage: "verify",
            detail:
              "HTTP 402 payment options do not match ENS and your approval. No signature requested.",
          },
        ],
      });
    progress.requirement = requirement;
    progress.steps.push({ stage: "verify", detail: "HTTP 402 matches approved ENS settings" });
    stage = "screen";
    const evidence = await screenRecipient(service.payment.payTo);
    progress.evidence = evidence;
    // Screening performs network I/O. Its observation time can be later than the pre-scan clock.
    now = Math.floor(Date.now() / 1000);
    const risk = evaluateRisk(evidence, service.payment.payTo, now);
    if (risk.outcome !== "continue")
      return store.finish(id, { ...progress, state: risk.outcome === "reject" ? "rejected" : "held", reason: risk.reason });
    progress.steps.push({ stage: "screen", detail: "Current Intercepta evidence passed" });
    // Approval and ENS freshness may expire while waiting for the scanner.
    const current = verifyRequest(service, service.endpoint, requirement, row.approval, now);
    if (current.outcome !== "continue")
      return store.finish(id, { ...progress, state: current.outcome === "reject" ? "rejected" : "held", reason: current.reason });
    stage = "prepare";
    if (request && requirement.extra?.ens402RequestBinding !== "v1")
      throw new Error("Request binding unsupported");
    const authorization: PublicAuthorization = {
      from: row.payer,
      to: requirement.payTo,
      value: requirement.amount,
      validAfter: "0",
      validBefore: String(now + requirement.maxTimeoutSeconds),
      nonce: request
        ? requestNonce(service.endpoint, request)
        : `0x${randomBytes(32).toString("hex")}`,
    };
    const prepared: ExternalPreparation = {
      typedData: {
        domain: {
          name: "USDC",
          version: "2",
          chainId: 84532,
          verifyingContract: USDC,
        },
        types: authorizationTypes,
        primaryType: "TransferWithAuthorization",
        message: authorization,
      },
      receipt: {
        metadataChallenge: challenge,
        request,
        state: "held",
        reason: "Awaiting your wallet signature",
        service,
        requirement,
        evidence,
        authorization,
        steps: [
          {
            stage: "resolve",
            detail: `Read ${service.name} at block ${service.block}`,
          },
          { stage: "verify", detail: "HTTP 402 matches approved ENS settings" },
          { stage: "screen", detail: "Current Intercepta evidence passed" },
        ],
      },
    };
    await store.savePrepared(id, prepared);
    return store.getExecution(id);
  } catch {
    return store.finish(id, {
      ...progress,
      state: "held",
      reason: {
        resolve: "Could not resolve current ENS settings; no signature requested",
        approval: "Service settings changed; review and create a new checkout",
        challenge: "Could not read a valid HTTP 402 payment request; no signature requested",
        metadata: "Service description or call schema does not match ENS and checkout; no signature requested",
        screen: "Intercepta screening unavailable; no signature requested",
        prepare: "Could not prepare wallet authorization; no signature requested",
      }[stage],
    });
  }
}
export async function submitExternal(
  input: Record<string, unknown>,
  guard: () => Promise<void>,
) {
  const id = uuid(input.id),
    store = getStore(),
    execution = await store.getExecution(id);
  if (execution.state !== "reserved") return execution;
  const prepared = execution.prepared as ExternalPreparation | undefined;
  const row = await store.getApproval(execution.approval_id);
  if (
    row.mode !== "self" ||
    !prepared ||
    typeof input.signature !== "string" ||
    !/^0x[0-9a-fA-F]{130}$/.test(input.signature)
  )
    throw new Error("Prepared payment and EOA signature required");
  const { typedData, receipt } = prepared;
  const a = typedData.message,
    requirement = receipt.requirement!;
  if (
    !(await verifyTypedData({
      address: row.payer as Address,
      ...typedData,
      message: {
        from: a.from as Address,
        to: a.to as Address,
        value: BigInt(a.value),
        validAfter: BigInt(a.validAfter),
        validBefore: BigInt(a.validBefore),
        nonce: a.nonce as Hex,
      },
      signature: input.signature as Hex,
    }))
  )
    throw new Error("Signature does not match approved payment");
  // An expired authorization can never transfer, so close it instead of leaving it reserved.
  if (Number(a.validBefore) <= Math.floor(Date.now() / 1000)) {
    const reason = "Signing window expired before submission; no payment was sent";
    return store.finish(id, {
      ...receipt,
      state: "held",
      reason,
      steps: [...receipt.steps, { stage: "expire", detail: reason }],
    });
  }
  const now = Math.floor(Date.now() / 1000),
    fresh = await inspectService(row.approval.name);
  if (
    Number(a.validBefore) <= now ||
    fresh.endpoint !== receipt.service!.endpoint ||
    verifyRequest(fresh, fresh.endpoint, requirement, row.approval, now)
      .outcome !== "continue"
  )
    throw new Error("Payment expired or ENS settings changed");
  const preparedMetadataHash = receipt.service?.call?.verification ? canonicalMetadata(receipt.service.description ?? "", receipt.service.call).hash : undefined;
  if (fresh.call?.verification || row.approval.metadataHash || preparedMetadataHash) {
    if (!receipt.metadataChallenge) throw new Error("Verified endpoint metadata is missing");
    verifyChallengeMetadata(fresh, receipt.metadataChallenge, receipt.request?.method ?? "GET", row.approval.metadataHash ?? preparedMetadataHash);
  }
  const evidence = await screenRecipient(requirement.payTo);
  if (evaluateRisk(evidence, requirement.payTo, now).outcome !== "continue")
    throw new Error("Screening did not pass");
  await guard();
  await store.beforeSubmit(id, a, requirement);
  const result = await submitResourcePayment({
    endpoint: fresh.endpoint,
    payload: { signature: input.signature, authorization: a },
    receipt: {
      ...receipt,
      evidence,
      steps: [
        ...receipt.steps,
        {
          stage: "sign",
          detail:
            "Verified your wallet signature; rechecked current ENS and risk",
        },
      ],
    },
    transport: createResourceTransport([new URL(fresh.endpoint).origin]),
    verifySettlement: (s, auth, r) =>
      verifySettlement(baseClient(), s, auth, r),
  });
  return store.finish(id, result);
}
