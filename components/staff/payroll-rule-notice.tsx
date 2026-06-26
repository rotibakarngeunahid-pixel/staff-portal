"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

const NOTICE_KEY = "rbn_payroll_notice_read_v1";
const COUNTDOWN_SECONDS = 4;

/** Cek apakah notice aturan penggajian sudah pernah dibaca di perangkat ini. */
function hasReadNotice(): boolean {
  try {
    return window.localStorage.getItem(NOTICE_KEY) === "true";
  } catch {
    // localStorage disabled → anggap belum dibaca agar info tetap tersampaikan.
    return false;
  }
}

function saveReadNotice(): void {
  try {
    window.localStorage.setItem(NOTICE_KEY, "true");
  } catch {
    // localStorage penuh/disabled — abaikan, popup tetap berfungsi tanpa persist.
  }
}

/**
 * Pop-up satu kali yang menjelaskan aturan baru: gaji hanya dihitung untuk shift
 * dengan absen masuk + absen keluar lengkap. Tidak bisa ditutup selama 4 detik
 * pertama (paksa baca), lalu tombol aktif. Setelah di-acknowledge tidak muncul lagi
 * (flag localStorage `rbn_payroll_notice_read_v1`; naikkan ke _v2 jika aturan berubah).
 */
export default function PayrollRuleNotice() {
  const [show, setShow] = useState(false);
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);

  useEffect(() => {
    if (!hasReadNotice()) setShow(true);
  }, []);

  // Hitung mundur — berjalan hanya saat popup tampil.
  useEffect(() => {
    if (!show) return;
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setRemaining((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [show, remaining]);

  // Kunci scroll body selama popup terbuka.
  useEffect(() => {
    if (!show) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [show]);

  if (!show) return null;

  const canClose = remaining <= 0;

  function handleAcknowledge() {
    if (!canClose) return;
    saveReadNotice();
    setShow(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payroll-notice-title"
      className="payroll-notice-backdrop"
    >
      <div className="payroll-notice-card">
        <div className="payroll-notice-header">
          <span className="payroll-notice-header-icon">
            <AlertTriangle size={22} strokeWidth={2.4} />
          </span>
          <div>
            <p className="payroll-notice-eyebrow">Roti Bakar Ngeunah</p>
            <h2 id="payroll-notice-title" className="payroll-notice-title">
              Perhatian — Aturan Penggajian
            </h2>
          </div>
        </div>

        <div className="payroll-notice-body">
          <p>
            Mulai sekarang, gaji kamu hanya akan dihitung untuk shift di mana kamu melakukan{" "}
            <strong>ABSEN MASUK</strong> dan <strong>ABSEN KELUAR</strong> secara lengkap. Jika salah satu
            tidak tercatat — baik karena lupa absen masuk atau lupa absen keluar — shift tersebut{" "}
            <strong>tidak akan masuk hitungan gaji</strong> bulan ini. Pastikan selalu absen masuk saat mulai
            shift dan absen keluar saat shift selesai.
          </p>

          <p className="payroll-notice-footnote">
            <ShieldCheck size={13} strokeWidth={2.4} />
            Absen masuk + absen keluar lengkap = gaji shift dihitung penuh.
          </p>
        </div>

        <div className="payroll-notice-actions">
          {!canClose && (
            <p className="payroll-notice-countdown">Harap baca dulu... ({remaining})</p>
          )}
          <button
            type="button"
            className="payroll-notice-btn"
            onClick={handleAcknowledge}
            disabled={!canClose}
            aria-disabled={!canClose}
          >
            {canClose ? "Saya Mengerti & Setuju" : `Saya Mengerti (${remaining})`}
          </button>
        </div>
      </div>
    </div>
  );
}
