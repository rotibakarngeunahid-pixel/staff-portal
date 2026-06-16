export const DEFAULT_SUPABASE_URL = "https://qqzynzklswrzhprawnhc.supabase.co";
export const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6InFxenluemtsc3dyemhwcmF3bmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwODI0NTQsImV4cCI6MjA5NDY1ODQ1NH0.Sj9L1hsbu3k_NQO0jeXtWvTdbtUeGd8cAqVhFCZ0BL8";

export function publicSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
}

export function publicSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
}

export function serverEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function secretEnv(name: string, developmentFallback: string) {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return developmentFallback;
}

export function pinSecret() {
  return secretEnv("PIN_SECRET", "dev-pin-secret-change-me");
}

export function jwtSecret() {
  return secretEnv("JWT_SECRET", "dev-jwt-secret-change-me");
}

export function photoStorageBaseUrl() {
  return process.env.PHOTO_STORAGE_BASE_URL || "https://foto-laporan-area.rotibakarngeunah.my.id";
}

export function photoUploadEndpoint() {
  return (
    process.env.PHOTO_UPLOAD_ENDPOINT ||
    "https://foto-laporan-area.rotibakarngeunah.my.id/api/upload-laporan-area.php"
  );
}

// Secret bersama untuk menandatangani upload foto (HMAC) ke hosting PHP.
// HARUS sama dengan PHOTO_UPLOAD_SECRET di photo-hosting/api/upload-laporan-area.php.
// Default bawaan dipakai agar absen masuk & laporan tetap jalan tanpa env tambahan.
// Untuk keamanan lebih tinggi, set PHOTO_UPLOAD_SECRET di Vercel DAN hosting PHP
// dengan nilai random yang sama, lalu default ini otomatis diabaikan.
const DEFAULT_PHOTO_UPLOAD_SECRET =
  "rbn-photo-3f4587808d8a33c7b978899c7a4c36aafe1b281d782bc490377924df11e10fe2";

export function photoUploadSecret() {
  return process.env.PHOTO_UPLOAD_SECRET || DEFAULT_PHOTO_UPLOAD_SECRET;
}
