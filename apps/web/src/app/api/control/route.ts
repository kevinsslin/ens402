import { recoverRegistration } from "@ens402/server/registration";
import { prepareExternal, submitExternal } from "@ens402/server/external";
import { authenticate, platformAction } from "@ens402/server/platform";
import {
  resumeApproval,
  authorized,
  cancelUnsentPurchase,
  walletBalance,
  createApproval,
  ensTransaction,
  executePurchase,
  getStore,
  inspectService,
  reconcilePurchase,
  revokeApproval,
} from "@ens402/server";
export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const operator = authorized(request.headers.get("authorization"));
  let principal;
  if (!operator) {
    try {
      principal = await authenticate(request.headers.get("authorization"));
    } catch {
      return Response.json(
        { error: "Sign in or provide a valid agent API key." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "Expected JSON." }, { status: 415 });
  let raw = "";
  const reader = request.body?.getReader();
  if (reader) {
    let bytes = 0;
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 16384)
          return Response.json(
            { error: "Request too large." },
            { status: 413 },
          );
        raw += decoder.decode(value, { stream: true });
      }
      raw += decoder.decode();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  try {
    if (principal)
      return Response.json(await platformAction(principal, input), {
        headers: { "Cache-Control": "no-store" },
      });
    let result: unknown;
    switch (input.action) {
      case "recover-registration":
        result = await recoverRegistration(
          String(input.id),
          typeof input.transaction === "string" ? input.transaction : undefined,
        );
        break;
      case "state":
        result = {
          names: (process.env.SERVICE_ENS_NAME || "")
            .split(",")
            .filter(Boolean),
          approvals: await getStore().listApprovals(),
          executions: await getStore().listExecutions(),
        };
        break;
      case "resume-approval":
        result = await resumeApproval(input.id);
        break;
      case "cancel":
        result = await cancelUnsentPurchase(input.id);
        break;
      case "balance":
        result = await walletBalance(input.id);
        break;
      case "inspect":
        result = await inspectService(input.name);
        break;
      case "approve":
        result = await createApproval(input);
        break;
      case "revoke":
        result = await revokeApproval(input.id);
        break;
      case "prepare-external":
        result = await prepareExternal(input);
        break;
      case "submit-external":
        result = await submitExternal(input, async () => {});
        break;
      case "execution":
        result = await getStore().getExecution(String(input.id));
        break;
      case "execute":
        result = await executePurchase(input);
        break;
      case "reconcile":
        result = await reconcilePurchase(input);
        break;
      case "ens":
        result = await ensTransaction({ ...input, action: input.operation });
        break;
      default:
        return Response.json({ error: "Unknown operation." }, { status: 400 });
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Provider exceptions can contain credential-bearing RPC URLs. Never echo them.
    return Response.json(
      {
        error: input.action === "inspect"
          ? "Could not verify this service's ENS configuration or payment recipient. Retry the lookup, or ask the provider to check its registry and resolver configuration."
          : input.action === "ens"
            ? "Could not prepare this ENS update. Check the selected wallet's record permissions and field values. No update was sent."
            : "Operation could not complete. Check setup, current approval, balance and permissions. Refresh the activity list before retrying a payment.",
      },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }
}
