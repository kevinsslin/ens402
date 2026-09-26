import { createHash } from "node:crypto";
export const serviceImagesSchema = `CREATE TABLE IF NOT EXISTS ens402_service_images (id text PRIMARY KEY, media_type text NOT NULL, bytes bytea NOT NULL CHECK(octet_length(bytes)<=1048576), created_at timestamptz NOT NULL DEFAULT now());`;
/** Only inert raster formats, with a strict upload limit. SVG and HTML are never accepted. */
export function serviceImage(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > 1048576)
    throw Error("Choose an image no larger than 1 MB.");
  const b = Buffer.from(bytes);
  const mediaType = b
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : b[0] === 255 && b[1] === 216 && b[2] === 255
      ? "image/jpeg"
      : b.toString("ascii", 0, 4) === "RIFF" &&
          b.toString("ascii", 8, 12) === "WEBP"
        ? "image/webp"
        : undefined;
  if (!mediaType) throw Error("Use a PNG, JPEG or WebP image.");
  return {
    id: createHash("sha256").update(b).digest("hex"),
    mediaType,
    bytes: b,
  };
}
