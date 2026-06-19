-- Migration 0014: Audit trail verifikasi wajah (face detection gate) pada absensi
--
-- Fitur deteksi keberadaan wajah client-side (MediaPipe) pada selfie absensi.
-- Kolom ini HANYA jejak audit — BUKAN data biometrik. Tidak menyimpan gambar
-- maupun embedding wajah, hanya status hasil gate + skor confidence (angka).
--
-- face_verification_status:
--   'passed'                                   = wajah terverifikasi normal saat capture
--   'bypassed_model_error'                     = model gagal load / GPU error → absensi
--                                                tetap diizinkan (fallback), ditandai
--   'bypassed_low_confidence_retry_exhausted'  = re-validasi foto gagal berulang →
--                                                diloloskan agar staff tidak terkunci
--   NULL                                       = absensi sebelum fitur ini, ATAU device
--                                                yang tidak mengirim status (kompatibel mundur)
--
-- face_confidence: skor confidence (0..1) pada foto final, untuk tuning threshold
--   (mis. memutuskan apakah 0.5 perlu dinaikkan/diturunkan). NULL bila tak terdeteksi.
--
-- Backward-compatible: nullable, tanpa default — data lama tetap NULL.
-- Ditulis best-effort dari API (UPDATE terpisah setelah absensi sukses) sehingga
-- jika migrasi ini belum diterapkan di DB, absensi TIDAK ikut gagal.

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS face_verification_status TEXT;

ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS face_confidence REAL;
