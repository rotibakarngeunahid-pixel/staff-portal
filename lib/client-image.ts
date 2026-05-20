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

export async function photoFromCanvas(
  source: HTMLCanvasElement,
  options: {
    baseName: string;
    maxDimension?: number;
    quality?: number;
    preferredType?: ImageFormat;
  }
): Promise<CapturedPhoto> {
  const maxDimension = options.maxDimension ?? 1600;
  const quality = options.quality ?? 0.78;
  const target = scaledSize(source.width, source.height, maxDimension);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Gagal memproses foto");
  ctx.drawImage(source, 0, 0, target.width, target.height);

  const preferredType = options.preferredType ?? "image/webp";
  let blob = await canvasToBlob(canvas, preferredType, quality);
  let mimeType = preferredType;

  if (!blob || blob.size <= 0) {
    mimeType = "image/jpeg";
    blob = await canvasToBlob(canvas, "image/jpeg", Math.min(0.86, quality + 0.05));
  }
  if (!blob || blob.size <= 0) throw new Error("Gagal mengompres foto");

  const fileName = `${options.baseName}.${extensionFor(mimeType)}`;
  return {
    blob,
    previewUrl: URL.createObjectURL(blob),
    mimeType,
    fileName,
    width: canvas.width,
    height: canvas.height,
    size: blob.size
  };
}

export function revokePhoto(photo?: Pick<CapturedPhoto, "previewUrl"> | null) {
  if (photo?.previewUrl) URL.revokeObjectURL(photo.previewUrl);
}
