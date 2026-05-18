"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { useSessionStore } from "@/stores/session";

export default function AdminLoginPage() {
  const router = useRouter();
  const setAdminToken = useSessionStore((state) => state.setAdminToken);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = await apiFetch<{ ok: true; token: string }>("/api/auth/admin-login", {
        method: "POST",
        body: { pin }
      });
      setAdminToken(payload.token);
      router.replace("/admin/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-4">
      <form className="panel w-full max-w-sm p-6" onSubmit={submit}>
        <div className="mb-5 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-lg bg-[var(--primary)] text-white">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black">Admin Login</h1>
            <p className="text-sm font-semibold text-slate-500">Masukkan PIN admin</p>
          </div>
        </div>
        <label className="label" htmlFor="adminPin">
          PIN
        </label>
        <input
          id="adminPin"
          className="field"
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
        />
        {error ? <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p> : null}
        <button className="btn btn-primary mt-4 w-full" disabled={pin.length < 4 || loading}>
          {loading ? "Memproses..." : "Masuk Dashboard"}
        </button>
      </form>
    </main>
  );
}
