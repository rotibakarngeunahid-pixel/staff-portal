"use client";

import { useEffect } from "react";

/**
 * Overlay loading full-screen yang memblokir SELURUH interaksi (tombol,
 * bottom nav, scroll) selama proses async berjalan — dipakai untuk transisi
 * antar tahapan kerja staff (absen → laporan), submit form, upload foto,
 * dan reload data supaya tidak ada aksi ganda atau interaksi sebelum siap.
 *
 * z-index 11000: di atas kamera (10000) dan popup saldo (9999), karena
 * overlay hanya tampil saat kamera sudah ditutup dan proses berjalan.
 */
export function LoadingOverlay({
  show,
  message,
  submessage
}: Readonly<{ show: boolean; message?: string; submessage?: string }>) {
  // Kunci scroll halaman selama overlay tampil (best-effort; overlay sendiri
  // sudah menangkap semua pointer/touch event karena menutup seluruh viewport).
  useEffect(() => {
    if (!show) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [show]);

  if (!show) return null;

  return (
    <div className="loading-overlay" role="alert" aria-live="assertive" aria-busy="true">
      <div className="loading-overlay-card">
        <div className="loading-overlay-spinner" aria-hidden="true" />
        <p className="loading-overlay-msg">{message || "Memproses..."}</p>
        {submessage ? <p className="loading-overlay-sub">{submessage}</p> : null}
        <p className="loading-overlay-hint">Mohon tunggu, jangan tutup aplikasi</p>
      </div>
    </div>
  );
}
