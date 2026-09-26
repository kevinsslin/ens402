import { observeEnsChanges } from "@ens402/server/multibaas-runtime";
import type { EnsContractKind, EnsEventName } from "@ens402/server/multibaas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const rawKind = query.get("kind") ?? "Registry";
  if (rawKind !== "Registry" && rawKind !== "Resolver")
    return Response.json({ error: "Choose Registry or Resolver" }, { status: 400, headers });
  const kind = rawKind as EnsContractKind;
  const event = query.get("event");
  const allowed = kind === "Registry"
    ? ["LabelRegistered", "EACRolesChanged"]
    : ["TextUpdated", "EACRolesChanged"];
  if (event !== null && !allowed.includes(event))
    return Response.json({ error: "Unsupported event for this contract" }, { status: 400, headers });
  const limit = Number(query.get("limit") ?? "20");
  const offset = Number(query.get("offset") ?? "0");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
      !Number.isSafeInteger(offset) || offset < 0)
    return Response.json({ error: "Invalid event page" }, { status: 400, headers });
  try {
    const page = await observeEnsChanges(kind, {
      limit,
      offset,
      ...(event ? { eventName: event as EnsEventName } : {}),
    });
    return Response.json({
      source: "Curvegrid MultiBaas",
      chainId: 11155111,
      authority: "observation_only",
      note: "Indexed history. Resolve current ENS state before an agent acts.",
      ...page,
    }, { headers });
  } catch {
    return Response.json({ error: "ENS activity feed unavailable" }, { status: 503, headers });
  }
}
