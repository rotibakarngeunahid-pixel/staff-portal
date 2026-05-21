"use client";

type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: Record<string, unknown> | FormData;
  role?: "staff" | "admin";
  redirectOnUnauthorized?: boolean;
};

type ApiPayload = {
  ok?: boolean;
  error?: string;
  errorCode?: string;
  [key: string]: unknown;
};

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function tokenFor(role?: "staff" | "admin") {
  if (typeof window === "undefined" || !role) return null;
  return localStorage.getItem(role === "admin" ? "rbn_admin_token" : "rbn_staff_token");
}

async function readPayload(response: Response): Promise<ApiPayload> {
  const text = await response.text();
  if (!text.trim()) {
    return response.ok ? { ok: true } : { ok: false, error: `Request gagal (${response.status})` };
  }

  const contentType = response.headers.get("content-type") || "";
  const looksJson = contentType.includes("application/json") || /^[\[{]/.test(text.trim());
  if (looksJson) {
    try {
      return JSON.parse(text) as ApiPayload;
    } catch {
      return {
        ok: false,
        error: response.ok ? "Response server tidak valid" : `Request gagal (${response.status})`
      };
    }
  }

  return {
    ok: false,
    error: response.ok
      ? "Response server bukan JSON"
      : text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || `Request gagal (${response.status})`
  };
}

function isLoginEndpoint(path: string) {
  const pathname = path.split("?")[0];
  return pathname === "/api/auth/login" || pathname === "/api/auth/admin-login";
}

function errorCode(data: ApiPayload, fallback: string) {
  return typeof data.errorCode === "string" && data.errorCode ? data.errorCode : fallback;
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method || "GET";
  const headers = new Headers();
  const token = tokenFor(options.role);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let body: BodyInit | undefined;
  let url = path;

  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body && method === "GET") {
    const params = new URLSearchParams();
    Object.entries(options.body).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
    });
    const query = params.toString();
    if (query) url += `${url.includes("?") ? "&" : "?"}${query}`;
  } else if (options.body) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(url, { method, headers, body, credentials: "include" });
  } catch {
    throw new ApiError("Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.", 0, "NETWORK_ERROR");
  }
  const data = (await readPayload(response)) as T & ApiPayload;

  // Session expired or invalid: clear tokens and redirect, except for login validation itself.
  if (response.status === 401) {
    const shouldRedirect = options.redirectOnUnauthorized ?? !isLoginEndpoint(path);
    if (shouldRedirect && typeof window !== "undefined") {
      localStorage.removeItem("rbn_staff_token");
      localStorage.removeItem("rbn_admin_token");
      const isAdmin = window.location.pathname.startsWith("/admin");
      window.location.replace(isAdmin ? "/admin/login" : "/app/login");
    }
    throw new ApiError(
      data.error || "Sesi sudah kedaluwarsa, silakan login ulang",
      response.status,
      errorCode(data, "UNAUTHORIZED")
    );
  }

  if (!response.ok || data.ok === false) {
    throw new ApiError(
      data.error || `Request gagal (${response.status})`,
      response.status,
      errorCode(data, response.ok ? "REQUEST_FAILED" : `HTTP_${response.status}`)
    );
  }
  return data as T;
}

export function dataUrlFromFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function compressDataUrl(dataUrl: string, maxDim = 1400, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const { width, height } = img;
      const longestSide = Math.max(width, height);
      const scale = longestSide > maxDim ? maxDim / longestSide : 1;
      const w = Math.round(width * scale);
      const h = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Gagal memproses gambar"));
    img.src = dataUrl;
  });
}
