import { authenticate } from "@ens402/server/platform";
import { getStore } from "@ens402/server";
import { createResourceTransport } from "@ens402/server/transport";
import { validateEndpoint } from "@ens402/sdk/ens";
import { parseCallMetadata, preparePostInput } from "@ens402/sdk/call";
import {
  parseChallengeMetadata,
  canonicalMetadata,
} from "@ens402/sdk/metadata";
import { parseChallenge } from "@ens402/sdk/http";
import { NETWORK, USDC, sameAddress, validAmount } from "@ens402/sdk";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let principal;
  try {
    principal = await authenticate(request.headers.get("authorization"));
    if (principal.kind !== "user") throw Error();
    await getStore().rateLimit(principal.ownerId);
  } catch {
    return Response.json(
      { error: "Sign in as a user to check a merchant endpoint" },
      { status: 401 },
    );
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 20000)
    return new Response(null, { status: 413 });
  try {
    const input = JSON.parse(raw);
    const endpoint = validateEndpoint(input.endpoint);
    const call = parseCallMetadata(input.callConfig);
    if (
      input.mode !== "inspect" &&
      (!validAmount(input.price) || !sameAddress(input.payTo, input.payTo))
    )
      throw Error("Invalid payment settings");
    const post =
      call.method === "POST"
        ? preparePostInput(
            JSON.stringify(call.example ?? {}),
            crypto.randomUUID(),
          )
        : undefined;
    const response = await createResourceTransport([new URL(endpoint).origin])(
      endpoint,
      {
        method: call.method,
        body: post?.body,
        headers: post ? { "Content-Type": "application/json" } : {},
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
    try {
      if (response.status !== 402)
        throw Error(
          "Endpoint must return an x402 payment challenge before registration",
        );
      const challenge = parseChallenge(
        response.headers.get("payment-required"),
        endpoint,
      );
      const metadata = parseChallengeMetadata(challenge);
      if (metadata.call.method !== call.method)
        throw Error("Endpoint metadata method differs from the request");
      const offered = challenge.accepts.filter(
        (r) =>
          r.scheme === "exact" &&
          r.network === NETWORK &&
          sameAddress(r.asset, USDC) &&
          validAmount(r.amount) &&
          (!post || r.extra?.ens402RequestBinding === "v1"),
      );
      if (input.mode === "inspect") {
        if (offered.length !== 1)
          throw Error(
            "Endpoint must expose one unambiguous Base Sepolia USDC offer",
          );
        return Response.json(
          { metadata, offer: offered[0], checkedAt: Date.now() },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      const expected = canonicalMetadata(input.description, call);
      if (expected.hash !== metadata.hash)
        throw Error(
          "Endpoint description or call schema differs from the registration draft. Inspect and review the endpoint again.",
        );
      const matches = challenge.accepts.some(
        (r) =>
          r.scheme === "exact" &&
          r.network === NETWORK &&
          sameAddress(r.asset, USDC) &&
          sameAddress(r.payTo, input.payTo) &&
          r.amount === input.price &&
          (!post || r.extra?.ens402RequestBinding === "v1"),
      );
      if (!matches)
        throw Error(
          "HTTP 402 terms differ from the requested USDC price, owner recipient or POST binding",
        );
      return Response.json(
        {
          verified: true,
          method: call.method,
          checkedAt: Date.now(),
          note: "Unsigned endpoint check only; Guard rechecks before payment",
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } finally {
      await response.body?.cancel();
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Endpoint check failed";
    return Response.json(
      {
        error:
          message.length < 200 && !message.includes("http")
            ? message
            : "Endpoint could not be safely checked",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
