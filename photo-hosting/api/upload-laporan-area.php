<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-RBN-Upload-Timestamp, X-RBN-Upload-Nonce, X-RBN-Upload-Scope, X-RBN-Content-SHA256, X-RBN-Upload-Signature');

/** Kualitas WebP output (0–100). Ubah nilai ini untuk menyesuaikan trade-off ukuran vs kualitas. */
const WEBP_QUALITY = 80;

function respond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function request_header(string $name): string {
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return isset($_SERVER[$key]) ? trim((string) $_SERVER[$key]) : '';
}

function allowed_origin(string $origin): bool {
    if ($origin === '') return false;
    $configured = getenv('PHOTO_UPLOAD_ALLOWED_ORIGINS') ?: '';
    $allowed = array_filter(array_map('trim', explode(',', $configured)));
    if (in_array($origin, $allowed, true)) return true;
    if (preg_match('#^https://[a-z0-9-]+\.vercel\.app$#i', $origin)) return true;
    if (preg_match('#^https://([a-z0-9-]+\.)?rotibakarngeunah\.my\.id$#i', $origin)) return true;
    if (preg_match('#^http://(localhost|127\.0\.0\.1)(:\d+)?$#i', $origin)) return true;
    return false;
}

function sanitize_scope(string $scope): string {
    $parts = preg_split('#[\\\\/]+#', $scope) ?: [];
    $clean = [];
    foreach ($parts as $part) {
        $part = preg_replace('/[^a-zA-Z0-9._-]+/', '-', trim($part));
        $part = trim((string) $part, '-.');
        if ($part !== '') $clean[] = $part;
        if (count($clean) >= 6) break;
    }
    return $clean ? implode('/', $clean) : 'general';
}

/**
 * Cek apakah GD extension tersedia dan mendukung encode WebP.
 * Kembalikan pesan error jika ada masalah, null jika siap dipakai.
 */
function gd_webp_error(): ?string {
    if (!extension_loaded('gd')) {
        return 'Ekstensi GD tidak tersedia di server ini';
    }
    if (!function_exists('imagewebp')) {
        return 'Fungsi imagewebp() tidak ada (versi GD terlalu lama)';
    }
    $info = gd_info();
    if (empty($info['WebP Support'])) {
        return 'GD tidak mendukung WebP — aktifkan di cPanel › PHP Extensions atau recompile PHP dengan --with-webp';
    }
    return null;
}

/**
 * Konversi gambar ke WebP menggunakan Imagick (dipakai sebagai fallback jika GD tidak ada).
 * Kembalikan true jika berhasil, false jika Imagick tidak tersedia atau gagal.
 */
function webp_via_imagick(string $srcPath, string $dstPath): bool {
    if (!extension_loaded('imagick') || !class_exists('Imagick')) {
        return false;
    }
    try {
        $im = new Imagick($srcPath);
        $im->setImageFormat('webp');
        $im->setImageCompressionQuality(WEBP_QUALITY);
        if ($im->getImageAlphaChannel()) {
            $im->setImageAlphaChannel(Imagick::ALPHACHANNEL_ACTIVATE);
        }
        $ok = $im->writeImage($dstPath);
        $im->destroy();
        return $ok;
    } catch (\Exception $e) {
        return false;
    }
}

$origin = isset($_SERVER['HTTP_ORIGIN']) ? (string) $_SERVER['HTTP_ORIGIN'] : '';
if (allowed_origin($origin)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['success' => false, 'error' => 'Method tidak valid']);
}

$maxBytes   = 10 * 1024 * 1024;
$baseUrl    = 'https://foto-laporan-area.rotibakarngeunah.my.id';
$root       = dirname(__DIR__);
$uploadBase = $root . '/uploads/laporan-area';

if (!isset($_FILES['foto'])) {
    respond(400, ['success' => false, 'error' => 'Field foto wajib dikirim']);
}

$file = $_FILES['foto'];

if (!is_array($file) || $file['error'] !== UPLOAD_ERR_OK) {
    respond(400, ['success' => false, 'error' => 'Upload gagal']);
}

if ((int) $file['size'] <= 0 || (int) $file['size'] > $maxBytes) {
    respond(413, ['success' => false, 'error' => 'Ukuran foto maksimal 10MB']);
}

$tmpPath = (string) $file['tmp_name'];
// HARUS sama dengan PHOTO_UPLOAD_SECRET / DEFAULT_PHOTO_UPLOAD_SECRET di Next.js (lib/env.ts).
// Default bawaan dipakai bila env var tidak diset agar upload tetap jalan tanpa konfigurasi tambahan.
$secret = getenv('PHOTO_UPLOAD_SECRET') ?: 'rbn-photo-3f4587808d8a33c7b978899c7a4c36aafe1b281d782bc490377924df11e10fe2';
if ($secret === '') {
    respond(503, ['success' => false, 'error' => 'Upload secret belum dikonfigurasi']);
}

$timestamp   = request_header('X-RBN-Upload-Timestamp');
$nonce       = request_header('X-RBN-Upload-Nonce');
$scope       = request_header('X-RBN-Upload-Scope');
$contentHash = strtolower(request_header('X-RBN-Content-SHA256'));
$signature   = strtolower(request_header('X-RBN-Upload-Signature'));

if ($timestamp === '' || $nonce === '' || $scope === '' || $contentHash === '' || $signature === '') {
    respond(401, ['success' => false, 'error' => 'Signature upload wajib dikirim']);
}
if (!ctype_digit($timestamp) || abs(time() - (int) $timestamp) > 300) {
    respond(401, ['success' => false, 'error' => 'Signature upload kedaluwarsa']);
}
if (!preg_match('/^[a-f0-9]{64}$/', $contentHash) || !preg_match('/^[a-f0-9]{64}$/', $signature)) {
    respond(401, ['success' => false, 'error' => 'Signature upload tidak valid']);
}

$actualHash = hash_file('sha256', $tmpPath);
if (!hash_equals($contentHash, $actualHash)) {
    respond(401, ['success' => false, 'error' => 'Hash konten upload tidak cocok']);
}

$payloadToSign     = $timestamp . "\n" . $nonce . "\n" . $scope . "\n" . $contentHash;
$expectedSignature = hash_hmac('sha256', $payloadToSign, $secret);
if (!hash_equals($expectedSignature, $signature)) {
    respond(401, ['success' => false, 'error' => 'Signature upload tidak valid']);
}

$info = getimagesize($tmpPath);
if ($info === false) {
    respond(415, ['success' => false, 'error' => 'File bukan gambar valid']);
}

$width  = (int) ($info[0] ?? 0);
$height = (int) ($info[1] ?? 0);
if ($width <= 0 || $height <= 0 || $width > 6000 || $height > 6000 || ($width * $height) > 24000000) {
    respond(413, ['success' => false, 'error' => 'Dimensi foto terlalu besar']);
}

$mime = $info['mime'] ?? '';
if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) {
    respond(415, ['success' => false, 'error' => 'Format harus JPG, PNG, atau WebP']);
}

// Buat direktori tujuan
$year      = date('Y');
$month     = date('m');
$safeScope = sanitize_scope($scope);
$targetDir = $uploadBase . '/' . $safeScope . '/' . $year . '/' . $month;
if (!is_dir($targetDir) && !mkdir($targetDir, 0755, true) && !is_dir($targetDir)) {
    respond(500, ['success' => false, 'error' => 'Gagal membuat folder upload']);
}

$random   = bin2hex(random_bytes(6));
$baseName = 'laporan-area-' . date('Ymd-His') . '-' . $random;
$warning  = null;
$savedExt = 'webp';

// ── Kasus 1: input sudah WebP ─────────────────────────────────────────────────
// Salin langsung; re-encode WebP→WebP hanya buang CPU dan turunkan kualitas.
if ($mime === 'image/webp') {
    $fileName   = $baseName . '.webp';
    $targetPath = $targetDir . '/' . $fileName;
    if (!copy($tmpPath, $targetPath)) {
        respond(500, ['success' => false, 'error' => 'Gagal menyimpan file WebP']);
    }
    chmod($targetPath, 0644);

} else {
    // ── Kasus 2: JPEG atau PNG → konversi ke WebP ─────────────────────────────

    $gdError = gd_webp_error();

    if ($gdError === null) {
        // ── Path A: GD tersedia dan mendukung WebP ────────────────────────────
        switch ($mime) {
            case 'image/jpeg':
                $image = imagecreatefromjpeg($tmpPath);
                break;
            case 'image/png':
                $image = imagecreatefrompng($tmpPath);
                if ($image !== false) {
                    imagepalettetotruecolor($image);
                    // false = jangan blend alpha ke background; pertahankan channel alpha mentah
                    imagealphablending($image, false);
                    imagesavealpha($image, true);
                }
                break;
            default:
                $image = false;
        }

        if ($image === false) {
            respond(415, ['success' => false, 'error' => 'Gagal membaca gambar']);
        }

        $fileName   = $baseName . '.webp';
        $targetPath = $targetDir . '/' . $fileName;

        if (!imagewebp($image, $targetPath, WEBP_QUALITY)) {
            imagedestroy($image);
            respond(500, ['success' => false, 'error' => 'Gagal menyimpan WebP']);
        }
        imagedestroy($image);
        chmod($targetPath, 0644);

    } elseif (webp_via_imagick($tmpPath, $targetDir . '/' . $baseName . '.webp')) {
        // ── Path B: Imagick berhasil ──────────────────────────────────────────
        $fileName   = $baseName . '.webp';
        $targetPath = $targetDir . '/' . $fileName;
        chmod($targetPath, 0644);

    } else {
        // ── Path C: Tidak ada GD WebP maupun Imagick ─────────────────────────
        // Simpan file asli apa adanya dan sertakan warning di respons.
        $savedExt   = ($mime === 'image/png') ? 'png' : 'jpg';
        $fileName   = $baseName . '.' . $savedExt;
        $targetPath = $targetDir . '/' . $fileName;
        // move_uploaded_file hanya valid untuk tmp file upload; copy sebagai fallback
        if (!move_uploaded_file($tmpPath, $targetPath) && !copy($tmpPath, $targetPath)) {
            respond(500, ['success' => false, 'error' => 'Gagal menyimpan file gambar']);
        }
        chmod($targetPath, 0644);
        $warning = 'WebP tidak tersedia: ' . $gdError
            . '. File disimpan sebagai ' . strtoupper($savedExt) . '.'
            . ' Aktifkan GD WebP atau Imagick di cPanel untuk konversi otomatis.';
    }
}

$relativePath = '/uploads/laporan-area/' . $safeScope . '/' . $year . '/' . $month . '/' . $fileName;
$response = [
    'success'    => true,
    'foto_url'   => $baseUrl . $relativePath,
    'file_name'  => $fileName,
    'format'     => $savedExt,
    'max_upload' => '10MB',
];
if ($warning !== null) {
    $response['warning'] = $warning;
}
echo json_encode($response);
