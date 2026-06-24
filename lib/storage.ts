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

// Batas ukuran sisi server. Bukan satu-satunya gerbang (Vercel route handler ~4.5 MB),
// tapi memberi pesan yang jelas bila foto besar tetap lolos (mis. via data URL).
export const MAX_UPLOAD_BYTES_SERVER = 9 * 1024 * 1024; // 9 MB (host PHP membatasi 10 MB)
export const ALLOWED_UPLOAD_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

/**
 * Error upload foto dengan status upstream dari host PHP, agar endpoint pemanggil
 * bisa memetakan ke pesan/HTTP code yang tepat (413 terlalu besar, 415 format, dst)
 * alih-alih semuanya jadi 500 generic "Server bermasalah".
 */
export class PhotoUploadError extends Error {
  upstreamStatus: number;
  constructor(message: string, upstreamStatus = 0) {
    super(message);
    this.name = "PhotoUploadError";
    this.upstreamStatus = upstreamStatus;
  }
}

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
    // Tidak ada batas ukuran di sisi server — foto sudah dikompres otomatis di client.
    file = new Blob([parsed.buffer], { type: parsed.contentType });
    contentType = parsed.contentType;
  } else if (input instanceof Blob) {
    // Tidak ada batas ukuran di sisi server — foto sudah dikompres otomatis di client.
    file = input;
    contentType = input.type || fallbackContentType;
    fileName = "name" in input && typeof input.name === "string" && input.name ? input.name : fileName;
  } else {
    return "";
  }

  if (!ALLOWED_UPLOAD_MIME.has(contentType.toLowerCase())) {
    throw new PhotoUploadError("Format foto belum didukung. Gunakan JPG, PNG, atau WebP.", 415);
  }

  const formData = new FormData();
  formData.append("foto", file, fileName);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > MAX_UPLOAD_BYTES_SERVER) {
    throw new PhotoUploadError("Foto terlalu besar untuk diunggah. Ambil/pilih foto lalu coba lagi.", 413);
  }
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const scope = uploadScope(path);

  let response: Response;
  try {
    response = await fetch(photoUploadEndpoint(), {
      method: "POST",
      headers: signedUploadHeaders(scope, contentHash),
      body: formData
    });
  } catch (networkError) {
    // Host PHP tak terjangkau / koneksi server→host putus (bukan kesalahan staff).
    console.error(
      `[uploadImage] network error to photo host scope=${scope} bytes=${bytes.byteLength} type=${contentType}:`,
      networkError instanceof Error ? networkError.message : networkError
    );
    throw new PhotoUploadError("Penyimpanan foto tidak dapat dihubungi. Coba lagi.", 0);
  }

  const result = (await response.json().catch(() => null)) as UploadResult | null;
  if (!response.ok || !result?.success || !result.foto_url) {
    // Log diagnostik AMAN (tanpa data sensitif/secret): status host + pesan + ukuran + tipe.
    console.error(
      `[uploadImage] upstream failed status=${response.status} scope=${scope} bytes=${bytes.byteLength} type=${contentType} error=${result?.error || "(no body)"}`
    );
    throw new PhotoUploadError(result?.error || "Gagal upload foto", response.status);
  }

  if (result.foto_url.startsWith("http")) return result.foto_url;
  return `${photoStorageBaseUrl().replace(/\/$/, "")}/${result.foto_url.replace(/^\//, "")}`;
}
