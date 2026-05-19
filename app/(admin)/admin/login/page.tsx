"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client-api";
import { useSessionStore } from "@/stores/session";

const PIN_LEN = 6;

export default function AdminLoginPage() {
  const router = useRouter();
  const setAdminToken = useSessionStore((state) => state.setAdminToken);
  const [pins, setPins] = useState<string[]>(Array(PIN_LEN).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pin = pins.join("");
  const ready = pin.length >= 4;

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  function handlePinChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...pins];
    next[index] = digit;
    setPins(next);
    if (digit && index < PIN_LEN - 1) pinRefs.current[index + 1]?.focus();
  }

  function handlePinKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (pins[index]) { const next = [...pins]; next[index] = ""; setPins(next); }
      else if (index > 0) { pinRefs.current[index - 1]?.focus(); const next = [...pins]; next[index - 1] = ""; setPins(next); }
    }
  }

  function handlePinPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, PIN_LEN);
    if (!text) return;
    const next = [...pins];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setPins(next);
    pinRefs.current[Math.min(text.length, PIN_LEN - 1)]?.focus();
  }

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
      setPins(Array(PIN_LEN).fill(""));
      pinRefs.current[0]?.focus();
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
          <p style={{ fontSize: 12, color: "var(--muted)" }}>Roti Bakar Ngeunah · Masukkan PIN Admin</p>
        </div>

        <label className="label" style={{ display: "block", marginBottom: 10 }}>PIN Admin</label>
        <div className="pin-row" onPaste={handlePinPaste} style={{ marginBottom: 20 }}>
          {pins.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { pinRefs.current[index] = el; }}
              className={`pin-input${digit ? " pin-filled" : ""}`}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handlePinChange(index, e.target.value)}
              onKeyDown={(e) => handlePinKeyDown(index, e)}
              autoComplete={index === 0 ? "current-password" : "off"}
              disabled={loading}
            />
          ))}
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
