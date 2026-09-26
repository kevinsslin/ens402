import { authenticate } from "@ens402/server/platform";
import { getStore } from "@ens402/server";
import { refreshConfiguredCatalog } from "../../../../../../../indexer/src/refresh";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "no-store" };

async function refresh() {
  try {
    const result = await refreshConfiguredCatalog();
    return Response.json(result, {
      status: result.status === "busy" ? 202 : 200,
      headers,
    });
  } catch (error) {
    const awaitingNamespace = error instanceof Error && error.message.startsWith("Supported root not linked:");
    return Response.json(
      {
        error: awaitingNamespace
          ? "The platform namespace is not linked at the finalized Sepolia block yet. Complete platform setup, then wait for finality before refreshing."
          : "Listing refresh could not finish. Check indexer configuration and try again later.",
      },
      { status: 503, headers },
    );
  }
}

/** Human-triggered bounded refresh. Clients cannot choose RPCs, roots or target names. */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "Same-origin request required" },
      { status: 403, headers },
    );
  if (new URL(request.url).search || request.body !== null)
    return Response.json(
      { error: "Refresh accepts no targets or request body" },
      { status: 400, headers },
    );
  let principal;
  try {
    principal = await authenticate(request.headers.get("authorization"));
  } catch {
    return Response.json(
      { error: "Sign in to refresh listings" },
      { status: 401, headers },
    );
  }
  if (principal.kind !== "user")
    return Response.json(
      { error: "Human account required" },
      { status: 403, headers },
    );
  try {
    await getStore().rateLimit(`discovery-sync:${principal.ownerId}`, 3);
  } catch {
    return Response.json(
      { error: "Refresh rate limit reached. Try again later." },
      { status: 429, headers },
    );
  }
  return refresh();
}
