% Droposting — Backend API

Droposting adalah layanan backend untuk otomatisasi pembuatan artikel WordPress melalui plugin `wpdroposting`. Backend ini mengelola lisensi, paket berlangganan, kuota, webhook pembayaran (Xendit), rate-limit, idempotency, serta integrasi AI (OpenAI‑compatible) untuk menghasilkan konten lengkap (judul, HTML, SEO, tags, gambar). Tersedia strict mode untuk memaksa penggunaan OpenAI (tanpa fallback) dan endpoint master template config.

Untuk detail teknis yang sangat lengkap (arsitektur, data model, kontrak endpoint), baca juga `AGENTS.md`.

### Akses Aplikasi
- Base URL backend: `http://droposting.local` — gunakan dari hosts dan dari dalam container.
- Admin Login: `http://droposting.local/admin/login` (bootstrap: `admin` / `123456`).
- Base API: `http://droposting.local/api/v1` — gunakan dari hosts dan dari dalam container.

## Daftar Isi
- Fitur
- Arsitektur Ringkas
- Instalasi & Menjalankan
- Konfigurasi ENV
- Skema Data
- API Penting & Contoh
- Alur Bisnis End-to-End
- Error, Rate Limit, Idempotency
- Testing Cepat
- Manajemen Prompt

## Fitur
- Registrasi akun + lisensi trial dengan kode deterministik per email+domain (`TRIAL_POSTS`, default 5)
- Akun & verifikasi situs: register/login kirim OTP 6 digit via email, wajib lolos ping plugin sebelum license dibind
- Verifikasi lisensi + bind domain unik; unbind 1×/30 hari (re-install di domain sama akan memakai license key yang sama)
- Paket BASIC30/PRO60 (30/60 artikel/bulan); reset via webhook `invoice.paid`
- Checkout session (Xendit mock/real) + metadata (license_key, plan_code)
- Webhook Xendit dengan token `X-CALLBACK-TOKEN`
- Generate artikel: title, html, meta_description, focus_keyword, excerpt, tags, featured_image_url, images_in_content[]; CTA otomatis mengikuti `cta_mode` (auto/none/manual) dengan snippet manual disisipkan setelah konten bila tersedia
- Generate judul bulk: POST `/generate/titles` (menghormati `template_meta.vars.title_include_keyword`).
- Template context tambahan: backend menerima `target_audience`, `country` (ISO 3166-1 alpha-2), `cta_mode`, dan `cta_manual_html`; seluruh nilai dinormalisasi via `TemplateMetaSanitizer` dan mempengaruhi instruksi prompt serta hasil akhir.
- Background Jobs (disarankan untuk Auto Post):
  - POST `/jobs/generate` → enqueue
  - GET `/jobs/{id}` → status+progress
  - GET `/jobs/{id}/result` → hasil konten+gambar
  - POST `/jobs/{id}/ack` → tandai hasil dikonsumsi
- Kuota trial/plan dihitung hanya saat generate berhasil
- Idempotency (header Idempotency-Key) dan rate limit (60/menit/lisensi)
- Logging events & usage summary; healthz & models (menampilkan provider/keys)
- Image proxy endpoint untuk mengamankan pemuatan gambar eksternal sederhana
- Master templates config `/templates/config` untuk memusatkan pilihan fields (tone, language, length) & prompt templates; respons juga menyertakan `image_styles`.
  - Konten: prompt judul menggunakan `{title_keyword_rule}`; prompt artikel memakai `{min_words}` (Short≈≥400, Medium≈≥800, Long≈≥1500) dan aturan “jangan tampilkan judul di body” (tanpa `<h1>`; gunakan `<h2>/<h3>` untuk subheading). Backend juga menghapus `<img>` dari HTML konten dan menghapus heading teratas yang identik dengan judul.
  - Meta (dua‑pass): pass 2 menurunkan `{meta_description, excerpt, tags[], focus_keyword}` dan kini juga `image_prompt_featured` (deskripsi singkat untuk featured image) — backend menambahkan style/quality saat memanggil image API.
  - Images: semua image dikonversi ke JPEG (quality 90) dengan resolusi sama; URL hasil berada di `/storage/gen-images/*.jpg`.

## Arsitektur Ringkas
- Laravel 11, PHP 8.3, MariaDB; prefix API `/api/v1`
- Middleware global: `RequestId` (X-Request-Id)
- Group protected: `LicenseGuard` (X-License-Key + X-Site-Domain) + `throttle:license`
- Error envelope global untuk semua API (lihat `bootstrap/app.php`)
- AI wiring: `App/Services/AI/*` mendukung provider OpenAI‑compatible (teks & gambar). Prompt templates dirender dengan variabel (`{topic}`, `{keyword}`, `{language}`, `{tone}`, `{length}`). Strict mode (`AI_STRICT`/`TEXT_STRICT`/`IMAGE_STRICT`) memaksa error bila provider gagal. Orientasi gambar didukung: featured (square/landscape/portrait), in‑content (square/landscape/portrait).

## Instalasi & Menjalankan
```
# Migrasi database, seed plans, dan clear cache
docker compose exec web-droposting bash -lc "cd droposting && php artisan migrate --force && php artisan db:seed --class=PlansSeeder && php artisan optimize:clear"

# Bersihkan data dev tanpa menyentuh master prompt
docker compose exec web-droposting bash -lc "cd droposting && php artisan droposting:clear-data"

# Lihat daftar route
docker compose exec web-droposting bash -lc "cd droposting && php artisan route:list"

# Build aset admin (Tailwind/Vite)
docker compose exec web-droposting bash -lc "cd droposting && npm run build"

# Health check dari host (port contoh 40084)
curl -i http://droposting.local/api/v1/healthz

# Health check dari dalam container web
docker compose exec web-droposting bash -lc "curl -i http://localhost/api/v1/healthz"

# Symlink storage publik (untuk akses /storage/... dari browser)
docker compose exec web-droposting bash -lc "cd droposting && php artisan storage:link"
```

### Admin Monitor (modern UI)
- Login: `http://droposting.local/admin/login` (username `admin`, password `123456`); bundle Tailwind/Vite berada di `resources/css/admin.css` & `resources/js/admin.js`.
- Sidebar collapsible memuat Requests Monitor, Sites Directory, Billing & Plans, Purchase History, Activity Dashboard, dan Token Usage.
- Requests Monitor: filter komprehensif (search/type/status/job type), KPI chips, daftar queued jobs, dan tabel gabungan dengan status badge.
- Content Job Detail: info tiles untuk metadata, kartu aksi, accordion `details-panel` untuk debug (cURL/code block kontras tinggi), token usage JSON yang sinkron dengan halaman Token Usage.
- Titles Job Detail: gaya serupa dengan token usage, daftar judul, dan raw JSON toggle.
- Token Usage: KPI cards, filter rentang tanggal, top license/domain, serta tabel “Recent Jobs” dengan kolom `Text In`, `Text Out`, `Img In`, `Img Out`, `Total` (mengambil angka yang sama dengan job detail).
- Responsif: sidebar collapse otomatis pada layar < `lg`, header sticky menyertakan tombol hamburger ber-`aria-label`, tabel dibungkus `overflow-x-auto`.
- QA checklist untuk admin UI tersedia di `docs/admin-ui-qa.md` (silakan isi hasil run setelah melakukan smoke test / audit).

### Akses Database
```
# CLI MariaDB untuk schema droposting
docker exec -it web-mariadb mysql -h db -P 3306 -u appuser -pchange_me_user droposting
```

## Konfigurasi ENV
- Database: `DB_CONNECTION=mysql`, `DB_HOST=db`, `DB_PORT=3306`, `DB_DATABASE=droposting`, `DB_USERNAME=appuser`, `DB_PASSWORD=change_me_user`
- Session/Queue/Cache: `SESSION_DRIVER=file`, `QUEUE_CONNECTION=sync`, `CACHE_STORE=file`
- Quota/Rate/Idempotency: `TRIAL_POSTS=5`, `RATE_LIMIT_PER_MINUTE=60`, `IDEMPOTENCY_TTL_DAYS=7`
- Xendit: `XENDIT_MOCK=true`, `XENDIT_API_KEY` (opsional), `XENDIT_CALLBACK_TOKEN`
- AI Provider (teks): `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_BASE_URL=https://api.openai.com/v1`
- AI Provider (gambar): `AI_IMAGE_PROVIDER=openai`, `IMAGE_QUALITY=low|high`
- AI Models (dev murah):
  - `MODEL_TEXT_MAIN=gpt-5-nano`, `MODEL_TEXT_TITLE=gpt-5-nano`, `MODEL_TEXT_SEO=gpt-5-nano`
  - `MODEL_IMAGE_FEATURED=gpt-image-1`, `MODEL_IMAGE_INCONTENT=gpt-image-1`
  - Override per proses (opsional): `TITLES_MODEL`, `TEMPLATE_WIZARD_MODEL`, `ARTICLE_MODEL_CONTENT/EXPAND/META/NATURALIZER/STABILIZER/VALIDATOR` dan reasoning `ARTICLE_REASONING_*` (set ke `none` untuk menonaktifkan pengiriman reasoning).
- Email/SMTP (untuk OTP & reset): `MAIL_MAILER=smtp|log`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`
- Image Proxy (opsional): `IMAGE_PROXY_BASE=http://droposting.local/api/v1/image-proxy`
- Dua‑pass & Meta extraction:
   - `TEXT_TWO_PASS=true` — aktifkan dua‑pass (konten → meta extractive, hemat biaya)
   - `TEXT_MODEL_FALLBACK=false` — matikan fallback silang model (stabilitas output)
   - `META_SELECTOR_MODE=deterministic|llm` — default `deterministic`; `llm` sebagai selektor kecil (opsional)
   - `META_MAX_OUTPUT_TOKENS=300` — limit keluaran selektor LLM
- Images: `IMAGE_MAX_ATTEMPTS=3` — retry generate image (default 3)
- Template length catalog: `TEMPLATE_LENGTHS_ENABLED=short,medium,long` — urutkan sesuai prioritas; kosongkan untuk fallback ke semua panjang default.
- Schema format: `TEXT_SCHEMA_TYPE=json_schema|json_object` — default `json_schema`. Gunakan `json_object` bila model Anda belum konsisten dengan JSON Schema.

Catatan dev (host-based):
- Set `APP_URL=http://<HOST_IP>:<PORT>` dan `IMAGE_PROXY_BASE=http://<HOST_IP>:<PORT>/api/v1/image-proxy` agar URL gambar lokal dapat dibuka langsung dari host.

## Skema Data (ringkas)
- users, licenses, **sites**, plans, subscriptions, usages, events, idempotency_keys, webhook_events
- generate_jobs (job background untuk generate; status/progress/result)
- titles_jobs (koordinator + child batch), site_assessments, onboarding_progress

## API Penting & Contoh
Protected endpoints (generate/titles/jobs) memerlukan header `X-License-Key` + `X-Site-Domain` (opsional `Idempotency-Key` untuk enqueue). Semua respons menyertakan `X-Request-Id`.

### Account & Site Binding
- Register site (trial)
```
curl -s http://droposting.local/api/v1/auth/register-site \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jane Doe","email":"jane@example.com","password":"changeme123","home_url":"https://wpdroposting.local"}'
```

- Verify site dengan kode 6 digit (wajib sebelum lisensi dipakai)
```
curl -s -X POST http://droposting.local/api/v1/auth/verify-site \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane@example.com","home_url":"https://wpdroposting.local","token":"123456"}'
```

- Resend kode (maks 5× per hari, hanya untuk status pending)
```
curl -s -X POST http://droposting.local/api/v1/auth/resend-site-token \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane@example.com","home_url":"https://wpdroposting.local"}'
```

- Login ulang dari instalasi lain (mengembalikan license key deterministik)
```
curl -s -X POST http://droposting.local/api/v1/auth/login-site \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane@example.com","password":"changeme123","home_url":"https://wpdroposting.local"}'
```

- Forgot/reset password
```
curl -s -X POST http://droposting.local/api/v1/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane@example.com"}'

curl -s -X POST http://droposting.local/api/v1/auth/reset-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane@example.com","token":"<RESET_TOKEN>","password":"newpass123","password_confirmation":"newpass123"}'
```

> Catatan: sebelum status site menjadi `verified`, backend melakukan HTTP GET ke `https://wpdroposting.local/wp-json/wpdroposting/v1/site/ping` untuk memastikan plugin aktif di domain tersebut.

### License & Konten API
- Verify license (bila perlu rebinding manual)
```
curl -i -X POST http://droposting.local/api/v1/license/verify \
  -H 'X-License-Key: <LICENSE>' -H 'X-Site-Domain: wpdroposting.local' \
  -H 'Content-Type: application/json' -d '{"domain":"wpdroposting.local"}'
```

- Generate artikel
```
curl -i -X POST http://droposting.local/api/v1/generate \
  -H 'X-License-Key: <LICENSE>' -H 'X-Site-Domain: wpdroposting.local' -H 'Idempotency-Key: uuid-1234' \
  -H 'Content-Type: application/json' -d '{"template":"wp_template","topic":"topik uji","template_meta":{"prompts":{"title":"judul","meta":"desc","keyword":"kw","excerpt":"ringkas","tags":"a,b"},"images":{"featured":true,"incontent":2}}}'
```

- Generate judul bulk (multi-template coordinator memakai endpoint `/titles/enqueue`)
```
curl -i -X POST http://droposting.local/api/v1/generate/titles \
  -H 'X-License-Key: <LICENSE>' -H 'X-Site-Domain: wpdroposting.local' \
  -H 'Content-Type: application/json' -d '{"keyword":"travel tips","count":10,"template_meta":{}}'
```

- Checkout session & webhook (Xendit mock)
```
curl -i -X POST http://droposting.local/api/v1/checkout/session \
  -H 'X-License-Key: <LICENSE>' -H 'Content-Type: application/json' -d '{"plan_code":"BASIC30"}'

curl -i -X POST http://droposting.local/api/v1/webhooks/xendit \
  -H 'Content-Type: application/json' -H 'X-CALLBACK-TOKEN: devtoken' \
  -d '{"event":"invoice.paid","metadata":{"license_key":"<LICENSE>","plan_code":"BASIC30"}}'
```

- Models, Templates config & Image proxy
```
curl -s http://droposting.local/api/v1/models
curl -s http://droposting.local/api/v1/templates/config | jq .
curl -I "http://droposting.local/api/v1/image-proxy?url=https://example.com/image.jpg"
```

- Debug gambar (protected; tidak mengurangi kuota)

### Jobs API (contoh cepat)
```
# Enqueue job
curl -s -X POST http://droposting.local/api/v1/jobs/generate \
  -H 'Content-Type: application/json' -H 'X-License-Key: <LICENSE>' -H 'X-Site-Domain: example.com' \
  -d '{"template_meta": {"images":{"featured":false,"incontent":0}}, "topic":"uji jobs"}'

# Poll status
curl -s http://droposting.local/api/v1/jobs/1 -H 'X-License-Key: <LICENSE>' -H 'X-Site-Domain: example.com'

# Ambil hasil saat succeeded
curl -s http://droposting.local/api/v1/jobs/1/result -H 'X-License-Key: <LICENSE>' -H 'X-Site-Domain: example.com'

# Ack setelah dikonsumsi
curl -s -X POST http://droposting.local/api/v1/jobs/1/ack \
  -H 'Content-Type: application/json' -H 'X-License-Key: <LICENSE>' -H 'X-Site-Domain: example.com' \
  -d '{"wp_post_id":123,"images_uploaded":true}'
```

### Processor (DB-backed)
```
# Jalankan sekali manual (dev):
docker compose exec web-droposting bash -lc "cd droposting && php artisan jobs:process --limit=1"

# Jalankan scheduler (sekali):
docker compose exec web-droposting bash -lc "cd droposting && php artisan schedule:run"
```

### Garbage Collect
```
# Hapus job lama (default 30 hari) dan file lokal /storage terkait (hanya disk public)
docker compose exec web-droposting bash -lc "cd droposting && php artisan jobs:gc --limit=500"

# Opsi: --days=14, --dry-run, --include-unconsumed
```
```
curl -s -X POST http://<HOST_IP>:<PORT>/api/v1/debug/image \
  -H 'Content-Type: application/json' \
  -H 'X-License-Key: <LICENSE>' \
  -H 'X-Site-Domain: <DOMAIN>' \
  -d '{"topic":"test","kind":"featured","size":"1024x1024"}'
```

## Alur Bisnis End-to-End
1. User register via `/auth/register-site` (name/email/password + `home_url`). Backend membuat `users`, `sites(status=pending)`, dan license deterministik (`lic_xxx`). Email OTP dikirim.
2. User input OTP di plugin (`/auth/verify-site`). Backend validasi token + ping `wp-json/wpdroposting/v1/site/ping`. Jika sukses → `sites.status=verified`, `licenses.bound_domain=host`, respon berisi license key & kuota.
3. Plugin menyimpan license key + domain header, wizard lanjut ke langkah scan/schedule.
4. Generate artikel/judul memakai header `X-License-Key` + `X-Site-Domain`; kuota berkurang hanya saat sukses.
5. Trial habis → API balas 402 `TRIAL_EXHAUSTED`; plugin memunculkan CTA upgrade.
6. Checkout → webhook `invoice.paid` (atau `subscription.activated`) mengaktifkan plan & reset kuota.
7. Scheduler plugin jalan sesuai jadwal; bila plan habis → status `paused_need_upgrade`; resume otomatis setelah upgrade.
8. Unbind manual tetap dibatasi 1×/30 hari melalui `/license/unbind` (domain harus diverifikasi kembali bila dipindah).

## Opsional — Push Verification (anti-duplikasi)
- Set `WP_PUSH_VERIFY=true` untuk pre/post verifikasi ke WP (`admin-post.php?action=wpdrop_job_status`, HMAC) agar backend melewati push bila WP sudah `consumed/wp_post_id`.

## Dev ergonomics
- `JOBS_PROCESS_IMMEDIATELY=true`: nudge `jobs:process --limit=1` di background setelah enqueue agar job cepat `running` (scheduler tetap backup).

## Error, Rate Limit, Idempotency
- Error envelope: `{error, code, message, request_id}`
- Rate limit: 60/menit/lisensi (429 RATE_LIMITED)
- Idempotency: replay → 409 + payload lama; usage tidak bertambah

## Perubahan Terbaru (Ringkas)

### Content Generation Hardening (Sept 2025)
- Stronger provider contract: Responses API kini memakai `response_format: json_schema` untuk artikel (`title`, `html`, `meta_description`, `focus_keyword`, `excerpt`, `tags[]`). Instruksi tegas: `html` WAJIB string HTML murni (bukan JSON atau code block), tanpa `<img>` dan tanpa boilerplate seperti “Visual/Ilustrasi/Foto bergaya …”.
- Nested/encoded JSON handling: jika penyedia mengembalikan JSON di dalam `html` (termasuk double‑encoded atau dalam code fences), backend akan mendeteksi, mendecode, dan mengambil `html` murni.
- HtmlCleaner diperkuat: hilangkan `<img>`, heading duplikat judul, artefak `n`, baris boilerplate, collapse `<br>` berlebihan, auto‑paragraph untuk plaintext.
- ArticleNormalizer: normalisasi akhir diterapkan di dua jalur — API `/generate` dan pipline DB `GenerateJobProcessor` — memastikan `result.html` selalu HTML bersih sebelum disimpan/dikirim ke klien.
- Truncation completion: jika akhir artikel terdeteksi terpotong (mis. kata “Di/Da” tanpa tanda akhir atau `<li>` sangat pendek), backend melakukan 1× “continuation pass” terarah untuk menutup paragraf/list dan menambah closing singkat bila perlu. Hasil disanitasi ulang.
- Dua‑pass teks (opsional, `TEXT_TWO_PASS=true`): Pass 1 hanya `{title, html}`; Pass 2 menurunkan `{meta_description, focus_keyword, excerpt, tags[]}` dari konten secara extractive. Meta deterministik bawaan; selektor LLM kecil opsional. Semua term dipasca‑filter agar muncul dalam konten.

### Responses API + Guards (Sept 2025)
- Migrasi Responses API: gunakan `text.format` (bukan `response_format`). Untuk schema, sertakan `name`, `schema`, `strict`.
- Parser: backend memprioritaskan `output_json`/`json` dari `output[].content[]`, lalu fallback ke `output_text` → JSON decode.
- Proteksi konten kosong: backend TIDAK lagi mempublikasikan stub/empty.
  - API `/generate`: mengembalikan 502 `TEXT_GENERATION_EMPTY` bila body terlalu pendek/kosong.
  - Jobs pipeline: job ditandai `failed` dengan `TEXT_GENERATION_EMPTY` dan EventLog `text_generation_empty` menyimpan ringkasan + debug request/response (snippet).

### Admin UI & Push (Sept 2025)
- Job Detail (Content): Overview menampilkan Usage Token; Final Result menyertakan Meta Description, Tags, Focus Keyword (template), Featured Image (open), dan Raw JSON. Bagian Text/Image Requests & Responses kini per-action (expandable) dengan cURL siap-copy dan response penuh. Logging penyedia teks disimpan utuh; logging gambar hanya memotong `data[].b64_json` menjadi 200 karakter—usage dan field lain tetap utuh.
- Titles Job: Overview menampilkan Usage Token dan Consumed; Progress; Final Result (titles + Raw JSON); Text Requests & Responses per-action dengan cURL; Actions selalu tampil (Retry saat failed).
- Push ke WordPress: Otomatis dan manual selalu menggunakan URL berbasis `WP_ADMIN_BASE` (jika di-set), selain itu domain job. Tidak ada fallback ke `http://web-wordpress`. EventLog push (otomatis/manua/outbox-titles) menyimpan `url`, `http`, `body` (500 chars), dan klasifikasi 4xx: `bad_sig` / `sig_mismatch` / `bad_json` / `client_error`.
- Titles ACK: `POST /api/v1/titles/{id}/ack` untuk menandai consumed titles saat WordPress menerima push (ditampilkan di Titles Job → Consumed).
- Panjang output: token budget lebih longgar; expansion hingga memenuhi `min_words` (Short≈≥400). ENV terkait:
  - `TEXT_TOKENS_PER_WORD` (default 1.8), `TEXT_MAX_TOKENS_CAP` (default 8192)
  - Floor per panjang: `TEXT_MAX_TOKENS_SHORT`/`MEDIUM`/`LONG` (defaults 2800/3600/5200)
- Post-processing opsional (Naturalizer → Stabilizer → Validator) untuk memanusiakan, menormalkan, dan QA konten. Aktifkan via `TEXT_POSTPROC_NATURALIZER`, `TEXT_POSTPROC_STABILIZER`, `TEXT_POSTPROC_VALIDATOR` (default `false`). Tiap langkah mencatat request/response dan token di Job Detail; Validator memicu satu siklus perbaikan tambahan bila gagal. Token budget post-processing menyesuaikan kategori panjang (short/medium/long) supaya Naturalizer/Stabilizer/Validator mendapatkan headroom yang selaras dengan output utama.

### Sync WordPress & Reliability
- Push selesai (content): saat job sukses, backend mengirim push (HMAC License Key) ke WP `admin-post.php?action=wpdrop_job_push`. Env `WP_ADMIN_BASE` dapat dipakai untuk base URL (contoh Docker: `http://wpdroposting.local`). Jika tidak di-set, fallback ke domain situs; bila gagal, fallback otomatis ke `http://wpdroposting.local`.
- Retry failed di WP (tanpa kunjungan): scheduler Laravel mengeksekusi `wp:retry-failed` setiap 5 menit untuk memicu endpoint HMAC `wpdrop_retry_failed_now` di WP sehingga retry tetap berjalan tanpa WP‑Cron.
- Force Sync di Admin Job: tombol “Force Sync (Push to WordPress)” tersedia untuk job `succeeded` yang belum tersinkron.
- Logging: EventLog `wp_push_content` menyimpan URL dan HTTP code dari push ke WP.

Catatan: Plugin WordPress tidak lagi melakukan normalisasi artikel — backend adalah sumber kebenaran (clean at source).
- TitlesJob: hasil `/generate/titles` disimpan dan ditampilkan di Recent Jobs + halaman detail `/admin/titles/{id}`
- Admin Monitor: sorting berdasarkan waktu eksekusi terbaru, Job Type filter, paginator custom untuk jobs gabungan
- Debug AI: model/usage tokens/prompt ditambahkan ke hasil job (Content dan Titles)
- `/generate/titles`: mendukung `template_meta.vars.avoid_titles` (plugin mengirim 60 judul terakhir) untuk mengurangi duplikasi
- `/templates/config`: respons kini menyertakan `image_styles` (untuk dropdown gaya gambar di plugin).
- Prompt titles/artikel menghormati `template_meta.vars.title_include_keyword` (wajib/supaya tidak menyertakan keyword di judul sesuai template).
- Prompt gambar menyertakan gaya dari `template_meta.vars.image_style`.
- Konten menambahkan baris akhir "Related : <link>" bila `use_internal_link` aktif dan URL tersedia.
- Jobs API: rute statis (`/jobs/stats`, dll.) dipindahkan sebelum rute dinamis `/jobs/{id}` + pembatasan numeric → mencegah benturan rute (memperbaiki 500 saat memanggil `/jobs/stats`).
- GenerateJobProcessor: mengisi `last_request_id` otomatis (UUID) bila kosong untuk mencegah error insert `events.request_id` null.

### Text Generation (Responses API)
- Backend teks/images kini menggunakan OpenAI Responses API.
- Titles (Generate Bulk) menggunakan `response_format: json_schema` agar model mengembalikan JSON ketat `{titles:[...]}` tanpa komentar.
- Parameter penting:
  - `reasoning: { effort: "low" }` untuk menekan keluaran reasoning-only.
  - `max_output_tokens` disetel konservatif (titles ~600) agar respons tidak `incomplete`.
- Parsing robust: coba `output_json/json` → fallback `output_text` (parse JSON) → fallback terakhir split per baris agar tidak “empty_titles”.
- Parameter yang ditolak model dihapus: `temperature`, `modalities`.
 - ENV baru:
   - `TITLES_MAX_TOKENS` (default 10000) — batas token keluaran titles; digunakan di semua permintaan (schema/JSON/plain).
   - `TITLES_STRICT_JSON` (default false) — bila true, fallback (JSON object/plain‑lines) dimatikan; sistem akan gagal bila schema utama tidak dipatuhi (kualitas > ketersediaan).

### Update Scheduler & Run Now (Background)
- Scheduler memproses batch kecil: `jobs:process --limit=3` per menit dan berjalan di background (lihat `bootstrap/app.php`).
- Layanan scheduler Docker: `web-droposting-scheduler` menjalankan `php artisan schedule:work` kontinu.
- Troubleshooting:
  - Jika “Queued” tidak bergerak: pastikan service scheduler aktif; Anda dapat menambah replika worker untuk throughput lebih tinggi (klaim job bersifat atomik).
  - Atur `JOBS_TIMEOUT_MINUTES` dan `IMAGE_STRICT=false` bila provider gambar lambat sehingga pipeline tetap bergerak.

### Auto‑Retry & Staging
- Auto‑retry untuk kegagalan transient:
  - TIMEOUT & IMAGE_GENERATION_FAILED akan di‑retry otomatis dengan backoff: 15m, 30m, 45m, 60m, 75m (`JOBS_MAX_ATTEMPTS`, default 5).
  - Field `retry_at` menunda pengambilan job sampai waktu retry tercapai; selection hanya mengambil job dengan `retry_at` <= now atau null.
- Staging konten:
  - Tahap teks disimpan terlebih dulu pada `result` dan progress menambahkan marker `Text ready`.
  - Jika image gagal/time‑out, job dipertahankan pada `text_ready` sehingga resume hanya mengerjakan image (teks tidak diulang & kuota tidak dobel).
  - Kuota dihitung saat finalisasi sukses.

### Atomic Claim & Paralelisme Aman
- Worker mengklaim job secara atomik (conditional update) sebelum memproses; aman untuk banyak worker paralel.

### Rekomendasi Push ke WordPress
- Tambahkan webhook push dari backend ke WP (admin‑post) saat job `succeeded` agar sinkronisasi lebih cepat. Fallback polling di plugin WP tetap aktif bila push gagal.

## Testing Cepat
Skrip bantu (jalankan di container `web-droposting`):
- `bash droposting/scripts/test_unbind.sh`
- `bash droposting/scripts/test_webhook_activate.sh`
- `export XENDIT_CALLBACK_TOKEN=devtoken && bash droposting/scripts/test_webhook_token.sh`

## Catatan
- Untuk biaya rendah, gunakan model teks `gpt-5-nano` dan `IMAGE_QUALITY=low`. Set `OPENAI_API_KEY` untuk mengaktifkan AI real.
- Xendit real: set `XENDIT_MOCK=false` dan `XENDIT_API_KEY`, konfigurasikan webhook publik.
- Orientasi gambar: backend meminta ukuran akhir langsung ke OpenAI (`1024x1024`, `1536x1024`, `1024x1536`), tanpa proses crop manual.

## Manajemen Prompt
- Sumber kanonik seluruh prompt berada di `resources/prompts/defaults.json`. Seeder `PromptTemplateSeeder` memakai file ini untuk menambah slug/locale yang belum ada tanpa menimpa perubahan yang sudah ada di database.
- Mengedit prompt lewat UI admin hanya memodifikasi database. Setelah selesai mengedit dan ingin menyinkronkan repository, jalankan:
  ```
  docker exec web-apache-php83-droposting bash -lc 'cd /var/www/html/droposting && php scripts/export_prompts.php > resources/prompts/defaults.json'
  ```
  kemudian `git add resources/prompts/defaults.json` sebelum commit.
- Saat deploy/refresh lingkungan baru, jalankan `php artisan db:seed --class=PromptTemplateSeeder` dan `php artisan cache:clear` setelah `git pull` supaya prompt baru tersalin ke database serta cache prompt terbarui.

## Titles (Async, Serial Batching)
- `/api/v1/titles/enqueue` mengantrikan TitlesJob dan men‑nudge processor `titles:process --limit=1` secara non‑blocking; klaim DB memastikan single‑flight.
- Processor berjalan tiap menit dan dapat menjalankan beberapa batch beruntun dalam satu tick (tanpa paralel/overlap).
- ENV penting:
  - `TITLES_BATCH_SIZE` — ukuran batch judul per request (mis. 200)
  - `TITLES_RATE_MULTIPLIER` — pengali percobaan generate judul per slot quota konten (default 3)
  - `TITLES_RATE_MAX` — batas global percobaan generate (default 0 = tidak dibatasi)
  - `TITLES_TICK_MAX_BATCHES` — jumlah batch beruntun per tick (mis. 5)
  - `TITLES_TICK_MAX_SECONDS` — batas durasi per tick (detik)
  - `TITLES_MAX_TOKENS`, `TITLES_STRICT_JSON`
  - `TITLES_AVOID_POSTS_LAST`, `TITLES_AVOID_QUEUE_BEFORE`, `TITLES_AVOID_QUEUE_AFTER` — jumlah sumber avoid yang dibaca plugin dari `/templates/config`
- Daftar avoid tidak dipotong oleh backend; plugin mengirim penuh sesuai konfigurasi, dan processor menambah judul terkumpul sebagai avoid antar‑batch. Token usage/model diakumulasikan lintas batch dan disajikan di Admin → Titles detail.

### Idempotency & Push (Event‑Driven)
- Idempotency (enqueue): `/api/v1/titles/enqueue` menerima header `Idempotency-Key`. Replay dengan key sama akan mengembalikan respons lama (job_id) tanpa membuat job duplikat.
- Push ke WordPress (tanpa setup user):
  - Saat TitlesJob `succeeded`, backend memasukkan notifikasi ke tabel outbox dan scheduler `pushes:dispatch` akan mengirim push ke WP (HMAC dengan License Key) ke `admin-post.php?action=wpdrop_job_push`.
  - WP memverifikasi signature/timestamp lalu melakukan GET `/titles/{job_id}` untuk mengambil data & buffer ke preview. Tab Bulk otomatis mengubah buffer menjadi preview bila belum ada preview aktif.
  - Fallback polling tetap aktif untuk robust bila push gagal.

### Outbox & Scheduler
- Tabel `push_outbox` menyimpan notifikasi pending dengan retry backoff: 30s, 2m, 10m, 1h, 6h (maks 6 percobaan). Perintah: `php artisan pushes:dispatch --limit=10` (terjadwal tiap menit).

### Failure Notifications & Auto Retry

- Jobs now distinguish between `failed` (retriable) and `dropped` (terminal) statuses.
- Configure email summaries and retry cooldown via the new env vars:
  - `JOB_ALERT_EMAIL` (default `droposting@tong.my.id`)
  - `JOB_ALERT_INTERVAL_MINUTES` (default `5`)
  - `JOB_AUTO_RETRY_INTERVAL_MINUTES` (default `15`)
- Commands:
  - `jobs:notify-failures` sends batched email summaries.
  - `jobs:auto-retry` requeues retriable jobs after the cooldown.
