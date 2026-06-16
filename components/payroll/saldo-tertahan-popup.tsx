"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Wallet } from "lucide-react";
import { rupiah } from "@/lib/format";

const COUNTDOWN_SECONDS = 4;

/** Format kunci acknowledgment: saldo_ack_{staffId}_{periodKey} (periodKey = YYYY-MM). */
export function saldoAckKey(staffId: string, periodKey: string): string {
  return `saldo_ack_${staffId}_${periodKey}`;
}

/**
 * Cek apakah staff sudah melihat info saldo tertahan untuk periode ini.
 * Jika localStorage tidak tersedia, kembalikan false agar popup tetap tampil
 * (gagal aman — staff tetap menerima informasi, tidak crash).
 */
export function hasSaldoAck(staffId: string, periodKey: string): boolean {
  if (!staffId || !periodKey) return false;
  try {
    return window.localStorage.getItem(saldoAckKey(staffId, periodKey)) === "1";
  } catch {
    return false;
  }
}

function saveSaldoAck(staffId: string, periodKey: string): void {
  if (!staffId || !periodKey) return;
  try {
    window.localStorage.setItem(saldoAckKey(staffId, periodKey), "1");
  } catch {
    // localStorage penuh / disabled — abaikan, popup tetap berfungsi tanpa persist.
  }
}

export function SaldoTertahanPopup({
  staffName,
  saldoTertahan,
  nextPeriodLabel,
  staffId,
  periodKey,
  onClose
}: {
  staffName: string;
  saldoTertahan: number;
  nextPeriodLabel: string;
  staffId: string;
  periodKey: string;
  onClose: () => void;
}) {
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);

  // Selalu pakai nilai terbaru di dalam interval tanpa membuat ulang timer.
  const persistRef = useRef<() => void>(() => {});
  const ackedRef = useRef(false);
  persistRef.current = () => {
    if (ackedRef.current) return;
    ackedRef.current = true;
    // Acknowledgment disimpan SEBELUM tombol tutup aktif (bukan saat diklik).
    saveSaldoAck(staffId, periodKey);
  };

  // Timer hitung mundur — reset tiap kali popup dibuka, dibersihkan saat unmount.
  useEffect(() => {
    ackedRef.current = false;
    setRemaining(COUNTDOWN_SECONDS);
    const id = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(id);
          persistRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Kunci scroll body selama popup terbuka.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const ready = remaining === 0;
  const firstName = staffName.trim().split(/\s+/)[0] || staffName.trim();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="saldo-tertahan-title"
      className="saldo-popup-backdrop"
    >
      <div className="saldo-popup-card">
        <div className="saldo-popup-header">
          <span className="saldo-popup-header-icon">
            <Wallet size={22} strokeWidth={2.4} />
          </span>
          <div>
            <p className="saldo-popup-eyebrow">Roti Bakar Ngeunah</p>
            <h2 id="saldo-tertahan-title" className="saldo-popup-title">
              Informasi Saldo Tertahan
            </h2>
          </div>
        </div>

        <div className="saldo-popup-body">
          <div className="saldo-popup-amount-box">
            <p className="saldo-popup-amount-label">Saldo tertahan</p>
            <p className="saldo-popup-amount">{rupiah(saldoTertahan)}</p>
            <p className="saldo-popup-amount-sub">
              Dibayarkan pada <strong>{nextPeriodLabel}</strong>
            </p>
          </div>

          <div className="saldo-popup-text">
            <p>
              Hai <strong>{firstName}</strong>, kami ingin menginformasikan bahwa sebagian dari gajimu
              sebesar <strong>{rupiah(saldoTertahan)}</strong> ditahan sementara dan akan dibayarkan pada{" "}
              {nextPeriodLabel}.
            </p>
            <p>
              Kebijakan ini diterapkan sebagai bentuk komitmen bersama sesuai dengan kontrak kerja yang
              telah disepakati. Saldo ini sepenuhnya menjadi hakmu dan akan kami bayarkan tepat waktu.
            </p>
            <p>Terima kasih atas dedikasi dan kepercayaanmu. 🙏</p>
          </div>

          <p className="saldo-popup-footnote">
            <ShieldCheck size={13} strokeWidth={2.4} />
            Kebijakan ini sesuai kontrak kerja kamu.
          </p>
        </div>

        <div className="saldo-popup-actions">
          <button
            type="button"
            className="saldo-popup-close-btn"
            onClick={onClose}
            disabled={!ready}
            aria-disabled={!ready}
          >
            {ready ? "Tutup ✓" : `Tutup (${remaining})`}
          </button>
        </div>
      </div>
    </div>
  );
}
