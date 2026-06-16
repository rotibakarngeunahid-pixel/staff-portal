import { createHash, createHmac, randomUUID } from "node:crypto";
import { photoStorageBaseUrl, photoUploadEndpoint, photoUploadSecret } from "@/lib/env";

type StorageClient = ReturnType<typeof import("@/lib/supabase/server").supabaseAdmin>;
type UploadResult = {
  success?: boolean;
  foto_url?: string;
  file_name?: string;
  format?: string;
  max_upload?: string;
  error?: string;
};

function dataUrlToBytes(dataUrl: string) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) {
    throw new Error("Format foto tidak valid");
  }
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

function uploadScope(path: string) {
  return String(path || "general")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .slice(0, 6)
    .join("/") || "general";
}

function signedUploadHeaders(scope: string, contentHash: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID();
  const payload = [timestamp, nonce, scope, contentHash].join("\n");
  const signature = createHmac("sha256", photoUploadSecret()).update(payload).digest("hex");
  return {
    "X-RBN-Upload-Timestamp": timestamp,
    "X-RBN-Upload-Nonce": nonce,
    "X-RBN-Upload-Scope": scope,
    "X-RBN-Content-SHA256": contentHash,
    "X-RBN-Upload-Signature": signature
  };
}

export async function uploadImage(
  _db: StorageClient,
  path: string,
  input: unknown,
  fallbackContentType = "image/jpeg"
) {
  if (!input) return "";

  let file: Blob;
  let contentType = fallbackContentType;
  let fileName = "foto.jpg";

  if (typeof input === "string") {
    if (!input.startsWith("data:")) return input;
    const parsed = dataUrlToBytes(input);
    if (parsed.buffer.byteLength > 1 * 1024 * 1024) {
      throw new Error("Ukuran foto maksimal 1MB");
    }
    file = new Blob([parsed.buffer], { type: parsed.contentType });
    contentType = parsed.contentType;
  } else if (input instanceof Blob) {
    if (input.size > 1 * 1024 * 1024) {
      throw new Error("Ukuran foto maksimal 1MB");
    }
    file = input;
    contentType = input.type || fallbackContentType;
    fileName = "name" in input && typeof input.name === "string" && input.name ? input.name : fileName;
  } else {
    return "";
  }

  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (!allowed.includes(contentType.toLowerCase())) {
    throw new Error("File harus berupa JPG, PNG, atau WebP");
  }

  const formData = new FormData();
  formData.append("foto", file, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const scope = uploadScope(path);

  const response = await fetch(photoUploadEndpoint(), {
    method: "POST",
    headers: signedUploadHeaders(scope, contentHash),
    body: formData
  });

  const result = (await response.json().catch(() => null)) as UploadResult | null;
  if (!response.ok || !result?.success || !result.foto_url) {
    throw new Error(result?.error || "Gagal upload foto");
  }

  if (result.foto_url.startsWith("http")) return result.foto_url;
  return `${photoStorageBaseUrl().replace(/\/$/, "")}/${result.foto_url.replace(/^\//, "")}`;
}
