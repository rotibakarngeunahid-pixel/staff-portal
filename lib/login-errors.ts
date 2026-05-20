"use client";

import { ApiError } from "@/lib/client-api";

type LoginKind = "admin" | "staff";

export function loginErrorMessage(error: unknown, kind: LoginKind) {
  const invalidMessage =
    kind === "admin"
      ? "Password salah, silakan coba lagi."
      : "Nama atau PIN tidak sesuai, silakan coba lagi.";

  if (error instanceof ApiError) {
    if (
      error.status === 401 ||
      error.code === "INVALID_ADMIN_PASSWORD" ||
      error.code === "INVALID_ADMIN_PIN" ||
      error.code === "INVALID_STAFF_LOGIN"
    ) {
      return invalidMessage;
    }

    if (error.status === 429) {
      return error.message || "Terlalu banyak percobaan. Silakan coba lagi nanti.";
    }

    if (error.status === 400) {
      return error.message || "Data login belum lengkap.";
    }

    if (error.status === 0 || error.code === "NETWORK_ERROR") {
      return "Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.";
    }

    if (error.status >= 500) {
      return "Server sedang bermasalah. Silakan coba lagi beberapa saat.";
    }
  }

  const message = error instanceof Error ? error.message : "";
  if (/request error|request gagal\s*\(500\)|\b500\b|server/i.test(message)) {
    return "Server sedang bermasalah. Silakan coba lagi beberapa saat.";
  }

  return message || "Login gagal. Silakan coba lagi.";
}
