"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: Readonly<{
  error: Error & { digest?: string };
  reset: () => void;
}>) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  function goToLogin() {
    window.location.href = window.location.pathname.startsWith("/admin") ? "/admin/login" : "/app/login";
  }

  return (
    <html lang="id">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#FFF7ED", color: "#2B1A12" }}>
        <main
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24
          }}
        >
          <section
            style={{
              width: "100%",
              maxWidth: 420,
              background: "#FFFFFF",
              border: "1px solid #F3D2C6",
              borderRadius: 16,
              padding: 24,
              boxShadow: "0 8px 32px rgba(43, 26, 18, 0.12)"
            }}
          >
            <h1 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 800 }}>Halaman gagal dimuat</h1>
            <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: 1.6, color: "#7A5B4D" }}>
              Muat ulang halaman. Jika masih gagal, kembali ke halaman login.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={reset}
                style={{
                  border: 0,
                  borderRadius: 10,
                  padding: "11px 16px",
                  background: "#B42318",
                  color: "#FFFFFF",
                  fontWeight: 800,
                  cursor: "pointer"
                }}
              >
                Coba Lagi
              </button>
              <button
                type="button"
                onClick={goToLogin}
                style={{
                  border: "1px solid #F3D2C6",
                  borderRadius: 10,
                  padding: "11px 16px",
                  background: "#FFFFFF",
                  color: "#2B1A12",
                  fontWeight: 800,
                  cursor: "pointer"
                }}
              >
                Login
              </button>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
