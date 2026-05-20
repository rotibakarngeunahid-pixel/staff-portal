"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client-api";
import { useSessionStore } from "@/stores/session";

export default function AdminLoginPage() {
  const router = useRouter();
  const setAdminToken = useSessionStore((state) => state.setAdminToken);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ready = pin.length >= 4;

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || loading) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const payload = await apiFetch<{ ok: true; token: string }>("/api/auth/admin-login", { method: "POST", body: { pin } });
      setAdminToken(payload.token);
      setSuccess("Login berhasil. Membuka dashboard...");
      redirectTimerRef.current = setTimeout(() => {
        router.replace("/admin/dashboard");
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal");
      setSuccess("");
      setPin("");
      inputRef.current?.focus();
      setLoading(false);
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(135deg, var(--primary-dark), var(--primary))", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <form
        onSubmit={submit}
        style={{ background: "#fff", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 360, boxShadow: "0 8px 40px rgba(0,0,0,.18)" }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <Image
            src="https://res.cloudinary.com/dckzmg6c3/image/upload/f_auto,q_auto,w_160/v1777572835/Untitled-2_tgjm4u.png"
            alt="Logo"
            width={56}
            height={56}
            style={{ borderRadius: 14, display: "block", margin: "0 auto 12px" }}
          />
          <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Admin Portal</h1>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>Roti Bakar Ngeunah · Masukkan Password Admin</p>
        </div>

        <label className="label" style={{ display: "block", marginBottom: 8 }}>Password Admin</label>
        <div style={{ position: "relative", marginBottom: 20 }}>
          <input
            ref={inputRef}
            type={showPin ? "text" : "password"}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoComplete="current-password"
            disabled={loading}
            placeholder="Masukkan password"
            style={{
              width: "100%",
              padding: "14px 48px 14px 16px",
              fontSize: 16,
              fontWeight: 700,
              borderRadius: 14,
              border: "2px solid var(--border)",
              outline: "none",
              background: pin ? "#FFF5F5" : "var(--surface-soft)",
              boxSizing: "border-box",
              letterSpacing: showPin ? "normal" : "0.2em",
            }}
          />
          <button
            type="button"
            onClick={() => setShowPin((v) => !v)}
            tabIndex={-1}
            style={{
              position: "absolute",
              right: 12,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "var(--muted)",
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label={showPin ? "Sembunyikan password" : "Tampilkan password"}
          >
            {showPin ? "🙈" : "👁"}
          </button>
        </div>

        {error ? (
          <div style={{ background: "var(--danger-bg)", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "var(--danger)", marginBottom: 16 }}>
            {error}
          </div>
        ) : null}
        {success ? (
          <div role="status" aria-live="polite" style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 800, color: "var(--success)", marginBottom: 16 }}>
            {success}
          </div>
        ) : null}

        <button
          type="submit"
          className={`btn btn-primary${ready && !loading ? " btn-glow" : ""}`}
          disabled={!ready || loading}
          style={{ width: "100%", padding: 16, fontSize: 15, borderRadius: 14 }}
        >
          {success ? "Login berhasil..." : loading ? "Memproses..." : "Masuk Dashboard →"}
        </button>
      </form>
    </main>
  );
}
