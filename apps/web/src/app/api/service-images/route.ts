import { authenticate } from "@ens402/server/platform";
import { getStore } from "@ens402/server";
import { serviceImage } from "../../../../../../packages/server/src/service-images";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  let principal;
  try {
    principal = await authenticate(request.headers.get("authorization"));
  } catch {
    return Response.json(
      { error: "Sign in to upload an image." },
      { status: 401 },
    );
  }
  if (principal.kind !== "user") return new Response(null, { status: 403 });
  try {
    await getStore().rateLimit(`image-upload:${principal.ownerId}`, 5);
  } catch {
    return Response.json(
      { error: "Upload limit reached. Try again in a minute." },
      { status: 429 },
    );
  }
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1048576)
        return Response.json(
          { error: "Choose an image no larger than 1 MB." },
          { status: 413 },
        );
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = Buffer.concat(parts);
  try {
    serviceImage(bytes);
  } catch {
    return Response.json(
      { error: "Use a PNG, JPEG or WebP image, up to 1 MB." },
      { status: 400 },
    );
  }
  try {
    const id = await getStore().saveServiceImage(bytes);
    return Response.json({
      url: new URL(`/api/service-images/${id}`, request.url).href,
    });
  } catch {
    return Response.json(
      {
        error:
          "Image storage is unavailable. Retry or use a public HTTPS image URL.",
      },
      { status: 503 },
    );
  }
}
