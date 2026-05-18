<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method tidak valid']);
    exit;
}

$maxBytes = 10 * 1024 * 1024;
$quality = 75;
$baseUrl = 'https://foto-laporan-area.rotibakarngeunah.my.id';
$root = dirname(__DIR__);
$uploadBase = $root . '/uploads/laporan-area';

if (!isset($_FILES['foto'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Field foto wajib dikirim']);
    exit;
}

$file = $_FILES['foto'];

if (!is_array($file) || $file['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Upload gagal']);
    exit;
}

if ((int) $file['size'] <= 0 || (int) $file['size'] > $maxBytes) {
    http_response_code(413);
    echo json_encode(['success' => false, 'error' => 'Ukuran foto maksimal 10MB']);
    exit;
}

$tmpPath = (string) $file['tmp_name'];
$info = getimagesize($tmpPath);
if ($info === false) {
    http_response_code(415);
    echo json_encode(['success' => false, 'error' => 'File bukan gambar valid']);
    exit;
}

$mime = $info['mime'] ?? '';
switch ($mime) {
    case 'image/jpeg':
        $image = imagecreatefromjpeg($tmpPath);
        break;
    case 'image/png':
        $image = imagecreatefrompng($tmpPath);
        if ($image !== false) {
            imagepalettetotruecolor($image);
            imagealphablending($image, true);
            imagesavealpha($image, true);
        }
        break;
    case 'image/webp':
        $image = imagecreatefromwebp($tmpPath);
        break;
    default:
        http_response_code(415);
        echo json_encode(['success' => false, 'error' => 'Format harus JPG, PNG, atau WebP']);
        exit;
}

if ($image === false) {
    http_response_code(415);
    echo json_encode(['success' => false, 'error' => 'Gagal membaca gambar']);
    exit;
}

$year = date('Y');
$month = date('m');
$targetDir = $uploadBase . '/' . $year . '/' . $month;
if (!is_dir($targetDir) && !mkdir($targetDir, 0755, true) && !is_dir($targetDir)) {
    imagedestroy($image);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Gagal membuat folder upload']);
    exit;
}

$random = bin2hex(random_bytes(6));
$fileName = 'laporan-area-' . date('Ymd-His') . '-' . $random . '.webp';
$targetPath = $targetDir . '/' . $fileName;

if (!imagewebp($image, $targetPath, $quality)) {
    imagedestroy($image);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Gagal menyimpan WebP']);
    exit;
}

imagedestroy($image);
chmod($targetPath, 0644);

$relativePath = '/uploads/laporan-area/' . $year . '/' . $month . '/' . $fileName;
echo json_encode([
    'success' => true,
    'foto_url' => $baseUrl . $relativePath,
    'file_name' => $fileName,
    'format' => 'webp',
    'max_upload' => '10MB'
]);
