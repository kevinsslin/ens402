import { requestNonce, type ResourceRequest } from "./request";
import { authorizationTypes } from "@x402/evm";
import { USDC } from "./index";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { ClientEvmSigner } from "@x402/evm";
import {
  evaluateRisk,
  verifyRequest,
  type Approval,
  type ServiceSnapshot,
  type Requirement,
  type RiskEvidence,
  type Decision,
} from "./index";

/** Produces a payment authorization only. The caller owns HTTP retry and settlement. */
export async function preparePayment(input: {
  request?: ResourceRequest;
  service: ServiceSnapshot;
  requestUrl: string;
  requirement: Requirement;
  approval: Approval;
  screen: (address: string) => Promise<RiskEvidence>;
  signer: ClientEvmSigner;
  now?: () => number;
}) {
  // Copy caller-owned data before any await to prevent mutation between checks and signing.
  const { service, requestUrl, requirement, approval } = structuredClone({
    service: input.service,
    requestUrl: input.requestUrl,
    requirement: input.requirement,
    approval: input.approval,
  });
  const request = input.request ? structuredClone(input.request) : undefined;
  const clock = input.now ?? (() => Math.floor(Date.now() / 1000));
  let result = verifyRequest(
    service,
    requestUrl,
    requirement,
    approval,
    clock(),
  );
  if (result.outcome !== "continue") return { decision: result };
  let evidence: RiskEvidence;
  try {
    evidence = await input.screen(requirement.payTo);
  } catch {
    return {
      decision: {
        outcome: "hold",
        reason: "Screening unavailable; no signature requested",
      } as Decision,
    };
  }
  result = evaluateRisk(evidence, requirement.payTo, clock());
  if (result.outcome !== "continue") return { decision: result, evidence };
  result = verifyRequest(service, requestUrl, requirement, approval, clock());
  if (result.outcome !== "continue") return { decision: result, evidence };
  try {
    if (request) {
      if (requirement.extra?.ens402RequestBinding !== "v1")
        throw new Error("Merchant does not support request binding");
      const authorization = {
        from: input.signer.address,
        to: requirement.payTo,
        value: requirement.amount,
        validAfter: "0",
        validBefore: String(clock() + requirement.maxTimeoutSeconds),
        nonce: requestNonce(requestUrl, request),
      };
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
          ...authorization,
          value: BigInt(authorization.value),
          validAfter: 0n,
          validBefore: BigInt(authorization.validBefore),
        },
      });
      return {
        decision: {
          outcome: "continue",
          reason: "Request-bound authorization signed",
        } as Decision,
        evidence,
        payload: { x402Version: 2, payload: { authorization, signature } },
      };
    }
    const payload = await new ExactEvmScheme(input.signer).createPaymentPayload(
      2,
      {
        ...requirement,
        network: "eip155:84532",
        extra: { name: "USDC", version: "2", assetTransferMethod: "eip3009" },
      },
    );
    return {
      decision: {
        outcome: "continue",
        reason: "Payment authorization signed; settlement not submitted",
      } as Decision,
      evidence,
      payload,
    };
  } catch {
    return {
      decision: {
        outcome: "hold",
        reason: "Signer did not authorize this payment",
      } as Decision,
      evidence,
    };
  }
}
