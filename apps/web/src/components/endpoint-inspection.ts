import type { VerifiedMetadata } from "@ens402/sdk/metadata";
export type EndpointInspection = {
  metadata: VerifiedMetadata;
  offer: { amount: string; payTo: string };
  checkedAt: number;
};
/** Read an unsigned challenge through the server's SSRF-protected probe. */
export async function inspectServiceEndpoint(
  endpoint: string,
  call: { method: string; example?: unknown },
  getToken: () => Promise<string | null>,
  signal?: AbortSignal,
): Promise<EndpointInspection> {
  const token = await getToken();
  if (!token) throw Error("Sign in to inspect the endpoint.");
  const response = await fetch("/api/provider/probe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      mode: "inspect",
      endpoint,
      callConfig: JSON.stringify(call),
    }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Endpoint inspection failed.");
  return result;
}
