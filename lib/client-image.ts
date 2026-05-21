"use client";

export type CapturedPhoto = {
  blob: Blob;
  previewUrl: string;
  mimeType: string;
  fileName: string;
  width: number;
  height: number;
  size: number;
};

type ImageFormat = "image/webp" | "image/jpeg";

const MAX_UPLOAD_BYTES = 1 * 1024 * 1024; // 1 MB

function extensionFor(mimeType: string) {
  return mimeType === "image/webp" ? "webp" : "jpg";
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: ImageFormat, quality: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

export function scaledSize(width: number, height: number, maxDimension: number) {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0 || longest <= maxDimension) {
    return { width, height };
  }
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

async function compressCanvas(
  source: HTMLCanvasElement,
  maxDimension: number,
  quality: number,
  preferredType: ImageFormat
): Promise<{ blob: Blob; mimeType: ImageFormat; canvas: HTMLCanvasElement } | null> {
  const target = scaledSize(source.width, source.height, maxDimension);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, target.width, target.height);

  let blob = await canvasToBlob(canvas, preferredType, quality);
  let mimeType: ImageFormat = preferredType;

  if (!blob || blob.size <= 0) {
    blob = await canvasToBlob(canvas, "image/jpeg", Math.min(0.86, quality + 0.05));
    mimeType = "image/jpeg";
  }
  if (!blob || blob.size <= 0) return null;

  return { blob, mimeType, canvas };
}

export async function photoFromCanvas(
  source: HTMLCanvasElement,
  options: {
    baseName: string;
    maxDimension?: number;
    quality?: number;
    preferredType?: ImageFormat;
  }
): Promise<CapturedPhoto> {
  const preferredType = options.preferredType ?? "image/webp";
  const initialMaxDim = options.maxDimension ?? 1600;
  const initialQuality = options.quality ?? 0.78;

  // Urutan percobaan: kurangi quality dulu, lalu kurangi dimensi
  const attempts: Array<{ dim: number; q: number }> = [
    { dim: initialMaxDim, q: initialQuality },
    { dim: initialMaxDim, q: Math.max(0.55, initialQuality - 0.12) },
    { dim: initialMaxDim, q: 0.45 },
    { dim: Math.round(initialMaxDim * 0.75), q: 0.55 },
    { dim: Math.round(initialMaxDim * 0.60), q: 0.55 }
  ];

  let bestResult: { blob: Blob; mimeType: ImageFormat; canvas: HTMLCanvasElement } | null = null;

  for (const attempt of attempts) {
    const result = await compressCanvas(source, attempt.dim, attempt.q, preferredType);
    if (!result) continue;

    // Simpan hasil terbaik yang belum tentu < MAX (sebagai fallback terakhir)
    if (!bestResult || result.blob.size < bestResult.blob.size) {
      bestResult = result;
    }

    if (result.blob.size <= MAX_UPLOAD_BYTES) {
      // Ukuran sudah di bawah 1 MB
      bestResult = result;
      break;
    }
  }

  if (!bestResult) throw new Error("Gagal mengompres foto");

  const fileName = `${options.baseName}.${extensionFor(bestResult.mimeType)}`;
  return {
    blob: bestResult.blob,
    previewUrl: URL.createObjectURL(bestResult.blob),
    mimeType: bestResult.mimeType,
    fileName,
    width: bestResult.canvas.width,
    height: bestResult.canvas.height,
    size: bestResult.blob.size
  };
}

export function revokePhoto(photo?: Pick<CapturedPhoto, "previewUrl"> | null) {
  if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
}
