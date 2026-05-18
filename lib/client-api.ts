"use client";

type ApiOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: Record<string, unknown> | FormData;
  role?: "staff" | "admin";
};

function tokenFor(role?: "staff" | "admin") {
  if (typeof window === "undefined" || !role) return null;
  return localStorage.getItem(role === "admin" ? "rbn_admin_token" : "rbn_staff_token");
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
    url += `?${params.toString()}`;
  } else if (options.body) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  const response = await fetch(url, { method, headers, body, credentials: "include" });
  const payload = (await response.json()) as T & { ok?: boolean; error?: string };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || "Request gagal");
  }
  return payload;
}

export function dataUrlFromFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
