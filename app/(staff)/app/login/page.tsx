"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client-api";
import { useSessionStore } from "@/stores/session";

const PIN_LEN = 4;

type StaffOption = { id: string; name: string; outlet_id: string | null };

export default function StaffLoginPage() {
  const router = useRouter();
  const setStaffToken = useSessionStore((state) => state.setStaffToken);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [name, setName] = useState("");
  const [pins, setPins] = useState<string[]>(Array(PIN_LEN).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const pin = pins.join("");
  const ready = useMemo(() => Boolean(name) && pin.length === PIN_LEN, [name, pin]);

  useEffect(() => {
    apiFetch<{ ok: true; staff: StaffOption[] }>("/api/staff/list")
      .then((payload) => setStaff(payload.staff))
      .catch((err: Error) => setError(err.message));
  }, []);

  function handlePinChange(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...pins];
    next[index] = digit;
    setPins(next);
    if (digit && index < PIN_LEN - 1) {
      pinRefs.current[index + 1]?.focus();
    }
  }

  function handlePinKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (pins[index]) {
        const next = [...pins];
        next[index] = "";
        setPins(next);
      } else if (index > 0) {
        pinRefs.current[index - 1]?.focus();
        const next = [...pins];
        next[index - 1] = "";
        setPins(next);
      }
    }
  }

  function handlePinPaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, PIN_LEN);
    if (!text) return;
    const next = [...pins];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setPins(next);
    const focusIdx = Math.min(text.length, PIN_LEN - 1);
    pinRefs.current[focusIdx]?.focus();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || loading) return;
    setLoading(true);
    setError("");
    try {
      const payload = await apiFetch<{ ok: true; token: string }>("/api/auth/login", {
        method: "POST",
        body: { name, pin }
      });
      setStaffToken(payload.token);
      router.replace("/app/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal");
      setPins(Array(PIN_LEN).fill(""));
      pinRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mobile-frame">
      {/* Header */}
      <header className="staff-hdr">
        <Image
          src="https://res.cloudinary.com/dckzmg6c3/image/upload/f_auto,q_auto,w_80/v1777572835/Untitled-2_tgjm4u.png"
          alt="Roti Bakar Ngeunah"
          width={36}
          height={36}
          className="staff-hdr-logo"
          priority
        />
        <div className="staff-hdr-info">
          <h1>Roti Bakar Ngeunah</h1>
          <p>Sistem Absensi</p>
        </div>
      </header>

      {/* Login card */}
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 20px" }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: "28px 22px", width: "100%", boxShadow: "0 2px 16px rgba(0,0,0,.08)" }}>
          <Image
            src="https://res.cloudinary.com/dckzmg6c3/image/upload/f_auto,q_auto,w_160/v1777572835/Untitled-2_tgjm4u.png"
            alt="Logo"
            width={56}
            height={56}
            style={{ borderRadius: 14, display: "block", margin: "0 auto 12px" }}
          />
          <h2 style={{ textAlign: "center", fontSize: 18, fontWeight: 900, marginBottom: 4 }}>Masuk Absensi</h2>
          <p style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginBottom: 22 }}>
            Pilih nama dan masukkan PIN kamu
          </p>

          <form onSubmit={submit}>
            <div style={{ marginBottom: 18 }}>
              <label className="label" htmlFor="staffName">Nama Kamu</label>
              <select
                id="staffName"
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 6L11 1' stroke='%239CA3AF' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 14px center",
                  appearance: "none"
                }}
              >
                <option value="">Pilih nama kamu</option>
                {staff.map((item) => (
                  <option key={item.id} value={item.name}>{item.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="label">PIN</label>
              <div className="pin-row" onPaste={handlePinPaste}>
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
              <p style={{ fontSize: 11, color: "var(--muted-light)", marginTop: 6, textAlign: "center" }}>
                PIN hanya angka · maksimal {PIN_LEN} digit
              </p>
            </div>

            {error ? (
              <div style={{ background: "var(--danger-bg)", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "var(--danger)", marginBottom: 16 }}>
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              className={`btn btn-primary${ready && !loading ? " btn-glow" : ""}`}
              disabled={!ready || loading}
              style={{ width: "100%", padding: "16px", fontSize: 15, borderRadius: 14 }}
            >
              {loading ? "Memproses..." : "Masuk →"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
