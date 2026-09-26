import { configuredProviderGroups } from "@ens402/server/config";
import { ensClient } from "@ens402/server";
import {
  prepareDelegateRotation,
  verifyDelegateRotation,
  prepareAdminHandover,
  adminAcceptanceMessage,
  type AdminHandover,
} from "../../../../../../../packages/sdk/src/ens/management";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (
    request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return new Response(null, { status: 403 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 8192)
    return new Response(null, { status: 413 });
  try {
    const { action, input, acceptance } = JSON.parse(raw);
    const client = ensClient();
    let result;
    if (action === "rotate")
      result = await prepareDelegateRotation(client, input);
    else if (action === "verify-rotation")
      result = await verifyDelegateRotation(client, input);
    else if (action === "acceptance-message")
      result = { message: adminAcceptanceMessage(input as AdminHandover) };
    else if (action === "handover") {
      const trusted = configuredProviderGroups().find(
        (group) =>
          group.providerRegistry.toLowerCase() ===
            input.registry?.toLowerCase() ||
          group.resolver.toLowerCase() === input.resolver?.toLowerCase(),
      );
      result = await prepareAdminHandover(
        client,
        input,
        acceptance,
        trusted,
        process.env.ENS_MANAGEMENT_RESOLVER_POLICY === "dedicated",
      );
    } else throw Error("Unknown management action");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Management unavailable";
    return Response.json(
      {
        error:
          message.length < 300 && !message.includes("http")
            ? message
            : "Native permission check failed. Verify the supplied wallets and contract addresses.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
