import { validateResourceRequest, type ResourceRequest } from "./request";

/** Provider-published invocation metadata. It describes an API; it does not authorize payment. */
export type CallMetadata = {
  method: "GET" | "POST";
  inputSchema?: Record<string, unknown>;
  example?: Record<string, unknown>;
  verification?: "ens402.service.v1";
  outputSchema?: Record<string, unknown>;
  outputExample?: Record<string, unknown>;
  fixture?: boolean;
};
export function parseCallMetadata(raw: string): CallMetadata {
  if (new TextEncoder().encode(raw).length > 16384) throw new Error("Call metadata exceeds 16384 bytes");
  const value = JSON.parse(raw) as CallMetadata;
  if (!value || !["GET", "POST"].includes(value.method)) throw new Error("Call metadata requires GET or POST");
  for (const object of [value.inputSchema, value.outputSchema, value.example, value.outputExample]) {
    if (object !== undefined && (!object || typeof object !== "object" || Array.isArray(object))) throw new Error("Call schema and examples must be JSON objects");
  }
  if (value.verification !== undefined && value.verification !== "ens402.service.v1") throw new Error("Unsupported metadata verification version");
  if (value.fixture !== undefined && typeof value.fixture !== "boolean") throw new Error("Fixture flag must be boolean");
  return value;
}
/** Preserve exact request bytes for one purchase; the merchant must support ENS402 request binding. */
export function preparePostInput(input: string, orderId: string): ResourceRequest {
  if (new TextEncoder().encode(input).length > 8192) throw new Error("Request input exceeds 8192 bytes");
  const data = JSON.parse(input) as Record<string, unknown>;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Request input must be a JSON object");
  if (data.orderId !== undefined && data.orderId !== orderId) throw new Error("Leave orderId out of the input; it is assigned to this purchase attempt");
  return validateResourceRequest({ method: "POST", body: JSON.stringify({ ...data, orderId }) });
}
