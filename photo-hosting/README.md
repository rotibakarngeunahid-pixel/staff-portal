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
- Output: WebP quality 75
- URL publik disimpan di Supabase, file fisik tetap di hosting foto.
