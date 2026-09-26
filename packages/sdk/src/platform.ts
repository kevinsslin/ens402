import { verifyChallengeMetadata } from "./metadata";
import { requestNonce, type ResourceRequest } from "./request";
import type { ClientEvmSigner } from "@x402/evm";
import { authorizationTypes } from "@x402/evm";
import {
  USDC,
  sameAddress,
  verifyRequest,
  evaluateRisk,
  type Approval,
} from "./index";
import type { PaymentReceipt, PublicAuthorization } from "./http";
import type { ServiceSnapshot } from "./index";

export type PlatformExecution = {
  id: string;
  approval_id: string;
  state: string;
  receipt: PaymentReceipt | null;
  prepared?: {
    typedData: {
      domain: {
        name: string;
        version: string;
        chainId: number;
        verifyingContract: string;
      };
      types: typeof authorizationTypes;
      primaryType: "TransferWithAuthorization";
      message: PublicAuthorization;
    };
    receipt: PaymentReceipt;
  };
};
/** A server/agent client. Never embed an agent API key in a public frontend. No automatic payment retries. */
export class ENS402Client {
  private readonly endpoint: string;
  constructor(
    private readonly options: {
      baseUrl: string;
      apiKey: string;
      fetch?: typeof fetch;
    },
  ) {
    const url = new URL("/api/v1", options.baseUrl);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      throw new Error("Use an HTTPS ENS402 deployment");
    if (url.username || url.password)
      throw new Error("Do not put credentials in the URL");
    this.endpoint = url.href;
  }
  private async call<T>(body: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(120000),
      });
    } catch {
      throw new Error(
        "ENS402 request outcome unknown. Query the same execution ID before retrying; do not create a new payment ID.",
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `ENS402 rejected the operation (HTTP ${response.status}). Check the existing execution before retrying.`,
      );
    }
    return response.json() as Promise<T>;
  }
  inspect(name: string) {
    return this.call<ServiceSnapshot>({ action: "inspect", name });
  }
  purchase(input: {
    id: string;
    approvalId: string;
    request?: ResourceRequest;
  }) {
    return this.call<PlatformExecution>({ action: "execute", ...input });
  }
  execution(id: string) {
    return this.call<PlatformExecution>({ action: "execution", id });
  }
  cancel(id: string) {
    return this.call<PlatformExecution>({ action: "cancel", id });
  }
  reconcile(id: string, transaction: string) {
    return this.call<PlatformExecution>({
      action: "reconcile",
      id,
      transaction,
    });
  }
  prepare(input: {
    id: string;
    approvalId: string;
    request?: ResourceRequest;
  }) {
    return this.call<PlatformExecution>({
      action: "prepare-external",
      ...input,
    });
  }
  submit(id: string, signature: string) {
    return this.call<PlatformExecution>({
      action: "submit-external",
      id,
      signature,
    });
  }
  async purchaseWithSigner(input: {
    id: string;
    approvalId: string;
    request?: ResourceRequest;
    approval: Approval;
    signer: ClientEvmSigner;
  }): Promise<PlatformExecution> {
    const execution = await this.prepare({
      id: input.id,
      approvalId: input.approvalId,
      request: input.request,
    });
    if (execution.state !== "reserved" || !execution.prepared) return execution;
    const { typedData: t, receipt: r } = execution.prepared,
      a = t.message,
      now = Math.floor(Date.now() / 1000);
    if (
      !r.service ||
      !r.requirement ||
      !r.evidence ||
      verifyRequest(
        r.service,
        r.service.endpoint,
        r.requirement,
        input.approval,
        now,
      ).outcome !== "continue" ||
      evaluateRisk(r.evidence, r.requirement.payTo, now).outcome !== "continue"
    )
      throw new Error("Prepared payment does not match local approval");
    if (r.service.call?.verification || input.approval.metadataHash) {
      if (!r.metadataChallenge) throw new Error("Prepared payment lacks verified service metadata");
      verifyChallengeMetadata(r.service, r.metadataChallenge, input.request?.method ?? "GET", input.approval.metadataHash);
    }
    if (
      t.domain.name !== "USDC" ||
      t.domain.version !== "2" ||
      t.domain.chainId !== 84532 ||
      !sameAddress(t.domain.verifyingContract, USDC) ||
      t.primaryType !== "TransferWithAuthorization" ||
      JSON.stringify(t.types) !== JSON.stringify(authorizationTypes) ||
      !sameAddress(a.from, input.signer.address) ||
      !sameAddress(a.to, r.requirement.payTo) ||
      a.value !== r.requirement.amount ||
      a.validAfter !== "0" ||
      !/^0x[0-9a-fA-F]{64}$/.test(a.nonce) ||
      !Number.isSafeInteger(Number(a.validBefore)) ||
      Number(a.validBefore) <= now ||
      Number(a.validBefore) > Math.min(now + 300, input.approval.expiresAt)
    )
      throw new Error("Prepared signature is outside local scope");
    if (
      input.request &&
      (r.request?.body !== input.request.body ||
        a.nonce !== requestNonce(r.service.endpoint, input.request))
    )
      throw new Error("Prepared payment does not bind the requested order");
    if (!input.request && r.request)
      throw new Error("Unexpected resource request");
    const signature = await input.signer.signTypedData({
      domain: {
        name: "USDC",
        version: "2",
        chainId: 84532,
        verifyingContract: USDC,
      },
      types: authorizationTypes,
      primaryType: "TransferWithAuthorization",
      message: {
        from: a.from,
        to: a.to,
        value: BigInt(a.value),
        validAfter: 0n,
        validBefore: BigInt(a.validBefore),
        nonce: a.nonce,
      },
    });
    return this.submit(input.id, signature);
  }
}
