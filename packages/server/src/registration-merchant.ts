import { serveMerchant } from "./merchant";
import {
  parseRegistrationOrder,
  nativeRegistrationGateway,
} from "./registration";
import { getStore } from "./index";
import { requireEnv } from "./config";
import { validateResourceRequest } from "@ens402/sdk/request";

/** Fixed-price native subname purchase. Payment and registration are on different testnets. */
export async function serveRegistration(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "Expected JSON" }, { status: 415, headers });
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: "Order required" }, { status: 400, headers });
  let raw = "",
    size = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 8192)
        return Response.json(
          { error: "Order too large" },
          { status: 413, headers },
        );
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
  let order;
  try {
    validateResourceRequest({ method: "POST", body: raw });
    order = parseRegistrationOrder(raw);
  } catch {
    return Response.json(
      {
        error:
          "Use orderId (UUID v4), label (3-32 lowercase characters), recipient (nonzero address).",
      },
      { status: 400, headers },
    );
  }
  try {
    const gateway = nativeRegistrationGateway();
    const url = requireEnv("ENS_REGISTRATION_RESOURCE_URL");
    if (
      new URL(url).protocol !== "https:" ||
      new URL(request.url).pathname !== new URL(url).pathname ||
      new URL(request.url).search
    )
      throw new Error("Invalid resource URL");
    const existing = await getStore().registrationOrder(order.orderId);
    if (!existing) await gateway.preflight(order);
    return await serveMerchant(request, "v1", {
      url,
      description: `Register a subname of ${gateway.parent} directly to its recipient on Sepolia. Expires at Unix ${gateway.expiry}.`,
      body: raw,
      call: { verification: "ens402.service.v1", method: "POST",
        inputSchema: { type: "object", properties: { orderId: {type:"string"}, label: {type:"string"}, recipient: {type:"string"} }, required:["orderId","label","recipient"], additionalProperties:false },
        outputSchema: { type: "object" } },
      beforeSettle: async (key, authorization, requirement) => {
        await gateway.preflight(order);
        await getStore().claimRegistration(
          order,
          gateway.parent,
          key,
          authorization,
          requirement,
          { registry: gateway.registry, expiry: gateway.expiry },
        );
      },
      deliver: async (settlement) => {
        await getStore().payRegistration(order.orderId, settlement);
        return gateway.fulfill(order);
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "Registration unavailable or order requires review. Check the existing order before paying again.",
      },
      { status: 409, headers },
    );
  }
}
