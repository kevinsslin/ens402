import {
  readServiceSettings,
  prepareServiceSettings,
} from "@/server/service-settings";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return Response.json(
    {
      error:
        message &&
        message.length < 220 &&
        !/https?:|calldata|request body/i.test(message)
          ? message
          : "Could not read or simulate these ENS settings. Retry the read; no update was sent.",
    },
    { status: 400, headers },
  );
}
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    return Response.json(
      await readServiceSettings(q.get("name") ?? "", q.get("wallet") ?? ""),
      { headers },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 16384)
    return new Response(null, { status: 413 });
  try {
    return Response.json(await prepareServiceSettings(JSON.parse(raw)), {
      headers,
    });
  } catch (e) {
    return failure(e);
  }
}
