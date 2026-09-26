import { encodeAbiParameters, keccak256, stringToHex } from "viem";

/** Optional ENS402 request binding. The order ID makes repeated purchases distinct. */
export type ResourceRequest = { method: "POST"; body: string };
export function validateResourceRequest(
  input: ResourceRequest,
): ResourceRequest {
  if (
    input.method !== "POST" ||
    typeof input.body !== "string" ||
    new TextEncoder().encode(input.body).length > 8192
  )
    throw new Error("Use a bounded JSON POST request");
  const data = JSON.parse(input.body);
  if (
    !data ||
    typeof data !== "object" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      data.orderId,
    )
  )
    throw new Error("A fresh UUID v4 orderId is required");
  return { method: "POST", body: input.body };
}
/** The token authorization commits to the endpoint and exact request bytes. */
export function requestNonce(endpoint: string, request: ResourceRequest) {
  validateResourceRequest(request);
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "string" }, { type: "bytes32" }],
      ["ens402.request.v1", endpoint, keccak256(stringToHex(request.body))],
    ),
  );
}
