"use client";
import { useId, useRef, useState } from "react";
import { ImagePlus, Upload, X } from "lucide-react";
import { Button } from "./ui/button";
import { Spinner } from "./ui/spinner";
export function ServiceImageField({
  value,
  onChange,
  disabled,
  getToken,
}: {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  getToken?: () => Promise<string | null>;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  async function upload(file?: File) {
    if (!file || disabled || uploading) return;
    setError("");
    setUploading(true);
    try {
      if (file.size > 1024 * 1024)
        throw Error("Choose an image no larger than 1 MB.");
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
        throw Error("Choose a PNG, JPEG or WebP image.");
      const token = await getToken?.();
      if (!token) throw Error("Sign in to upload an image.");
      const response = await fetch("/api/service-images", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": file.type,
        },
        body: file,
        signal: AbortSignal.timeout(25000),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Image upload failed. Please retry.");
      onChange(result.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image upload failed.");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="mt-3 space-y-3">
      <div
        className="flex flex-wrap items-center gap-5 rounded-xl border-2 border-dashed border-primary/20 bg-primary/[0.025] p-5"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void upload(e.dataTransfer.files[0]);
        }}
      >
        {value ? (
          <img
            src={value}
            alt="Service image preview"
            referrerPolicy="no-referrer"
            className="size-24 rounded-xl border bg-background object-cover"
          />
        ) : (
          <div className="flex size-24 items-center justify-center rounded-xl bg-primary/5">
            <ImagePlus className="size-8 text-primary/60" />
          </div>
        )}
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            disabled={disabled || uploading}
            onClick={() => input.current?.click()}
          >
            {uploading ? <Spinner /> : <Upload className="size-4" />}
            {uploading
              ? "Uploading…"
              : value
                ? "Replace image"
                : "Upload image"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Or drop an image here · PNG, JPEG, WebP · max 1 MB
          </p>
          <p className="text-xs text-muted-foreground">
            Published when you save the service.
          </p>
        </div>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove service image"
            disabled={disabled || uploading}
            onClick={() => onChange("")}
          >
            <X className="size-4" />
          </Button>
        )}
        <input
          ref={input}
          type="file"
          className="sr-only"
          aria-label="Upload service image"
          accept="image/png,image/jpeg,image/webp"
          disabled={disabled || uploading}
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      <details className="text-sm text-muted-foreground">
        <summary className="cursor-pointer">Use an image URL instead</summary>
        <label htmlFor={id} className="sr-only">
          Public image URL
        </label>
        <input
          id={id}
          type="url"
          value={value}
          disabled={disabled || uploading}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://example.com/image.png"
          className="mt-2 w-full rounded-lg border bg-background p-3 text-sm"
        />
      </details>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
