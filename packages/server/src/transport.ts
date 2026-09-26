import { lookup } from "node:dns/promises";
import { Agent, fetch as undiciFetch } from "undici";
import ipaddr from "ipaddr.js";
import type { ResourceTransport } from "@ens402/sdk/http";

export function publicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.process(address);
    return parsed.range() === "unicast";
  } catch {
    return false;
  }
}
/** Resolve once, reject private ranges, and pin the chosen IP at the socket lookup. */
export function createResourceTransport(
  allowedOrigins: readonly string[],
): ResourceTransport {
  const allowed = new Set(
    allowedOrigins.map((origin) => new URL(origin).origin),
  );
  return async (input, options) => {
    const url = new URL(input);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      !allowed.has(url.origin)
    )
      throw new Error("Merchant origin is not allowed");
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });
    if (
      !addresses.length ||
      addresses.some((item) => !publicAddress(item.address))
    )
      throw new Error("Merchant must resolve only to public IP addresses");
    const target = addresses[0]!;
    const dispatcher = new Agent({
      connect: {
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [target]);
          else callback(null, target.address, target.family);
        },
      },
    });
    try {
      const response = await undiciFetch(url, { ...options, dispatcher });
      // The agent cannot be closed until the response body is consumed or cancelled.
      const stream = response.body;
      const reader = stream?.getReader();
      let cancelled = false;
      let cleanup: Promise<void> | undefined;
      // Cancel can resolve an in-flight read. Only one path may clean up the agent.
      const close = () =>
        (cleanup ??= dispatcher.close().catch(async () => {
          await dispatcher.destroy().catch(() => {});
        }));
      const body = reader
        ? new ReadableStream<Uint8Array>({
            async pull(controller) {
              try {
                const part = await reader.read();
                if (cancelled) return;
                if (part.done) {
                  controller.close();
                  await close();
                } else controller.enqueue(part.value);
              } catch (error) {
                if (!cancelled) controller.error(error);
                await close();
              }
            },
            async cancel() {
              cancelled = true;
              try {
                await reader.cancel();
              } finally {
                await close();
              }
            },
          })
        : null;
      if (!body) void close();
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: Array.from(response.headers.entries()),
      });
    } catch {
      await dispatcher.destroy();
      throw new Error("Merchant request failed");
    }
  };
}
