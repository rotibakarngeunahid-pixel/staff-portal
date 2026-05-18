"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSessionStore } from "@/stores/session";

type StaffOption = { id: string; name: string; outlet_id: string | null };

export default function StaffLoginPage() {
  const router = useRouter();
  const setStaffToken = useSessionStore((state) => state.setStaffToken);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ ok: true; staff: StaffOption[] }>("/api/staff/list")
      .then((payload) => setStaff(payload.staff))
      .catch((err: Error) => setError(err.message));
  }, []);

  const ready = useMemo(() => name && pin.length >= 4, [name, pin]);

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
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mobile-frame flex min-h-screen flex-col justify-center px-5 py-8">
      <section className="panel p-6">
        <Image
          src="https://res.cloudinary.com/dckzmg6c3/image/upload/f_auto,q_auto,w_160/v1777572835/Untitled-2_tgjm4u.png"
          alt="Roti Bakar Ngeunah"
          width={72}
          height={72}
          className="mx-auto rounded-2xl"
          priority
        />
        <div className="mt-4 text-center">
          <h1 className="text-2xl font-black">Staff Portal</h1>
          <p className="mt-1 text-sm font-bold text-slate-500">Absensi dan laporan toko</p>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="staffName">
              Nama Staff
            </label>
            <select id="staffName" className="field" value={name} onChange={(event) => setName(event.target.value)}>
              <option value="">Pilih nama</option>
              {staff.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pin">
              PIN
            </label>
            <input
              id="pin"
              className="field"
              inputMode="numeric"
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              minLength={4}
              maxLength={6}
              autoComplete="current-password"
            />
          </div>
          {error ? <p className="rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
          <button className="btn btn-primary w-full" disabled={!ready || loading}>
            <LogIn size={18} />
            {loading ? "Memproses..." : "Masuk"}
          </button>
        </form>
      </section>
    </main>
  );
}
