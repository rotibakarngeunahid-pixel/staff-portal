# Photo Hosting

Upload isi folder ini ke:

```text
public_html/foto-laporan-area.rotibakarngeunah.my.id/
```

Endpoint yang dipakai aplikasi:

```text
https://foto-laporan-area.rotibakarngeunah.my.id/api/upload-laporan-area.php
```

Ketentuan:

- Field upload: `foto`
- Input: JPG, PNG, atau WebP
- Maksimal: 10MB
- Dimensi maksimal: 6000px per sisi dan 24MP total
- Header wajib: `X-RBN-Upload-Timestamp`, `X-RBN-Upload-Nonce`, `X-RBN-Upload-Scope`, `X-RBN-Content-SHA256`, `X-RBN-Upload-Signature`
- `PHOTO_UPLOAD_SECRET` di hosting PHP harus sama dengan `PHOTO_UPLOAD_SECRET` di aplikasi Next.js
- Optional CORS allowlist: set `PHOTO_UPLOAD_ALLOWED_ORIGINS` berisi daftar origin dipisah koma
- Output: WebP quality 75
- URL publik disimpan di Supabase, file fisik tetap di hosting foto.
