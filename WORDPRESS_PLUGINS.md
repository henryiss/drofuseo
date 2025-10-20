% wpdroposting — WordPress Plugin

wpdroposting adalah plugin WordPress yang menjadi antarmuka admin untuk layanan backend `droposting`. Plugin ini memungkinkan pembuatan artikel otomatis (single generate dan terjadwal) dengan AI (diproses di backend), manajemen lisensi & kuota, serta logging aktivitas.

Untuk informasi teknis yang lebih dalam (struktur file, tabel kustom, cron, payload template), baca `AGENTS.md`.

## Daftar Isi
- Fitur
- Persyaratan & Lingkungan Docker
- Instalasi & Aktivasi
- Konfigurasi (Settings)
- Lisensi & Billing (License)
- Templates (CPT)
- Generate (Single)
- Generate Bulk (Titles)
- Publishing Queue
- Logs
- Troubleshooting

## Fitur
- License & Billing UI: simpan license key, verify/bind, unbind, upgrade plan (checkout)
- Templates (CPT): pilihan input (Topic/Keyword/Tone/Language/Length) dari backend `/templates/config`; konteks tambahan `Target Audience` (deskripsi pembaca), `Country` (kode ISO 3166-1 alpha-2), serta `Call to Action` (auto / none / manual HTML) dengan sanitasi otomatis; opsi gambar (featured+orientation; in‑content+orientation+position); default author/categories/status
- Generate (Single): pilih template + topic; preview; insert sebagai post (draft/publish sesuai template); opsi Disable Images per run; hasil artikel mengikuti `target audience`/`country` dan CTA sesuai mode (auto, none, atau manual HTML yang disisipkan di akhir konten)
- Generate Bulk (Titles): keyword diambil dari template; pilih jumlah (default 5) dan jadwal → generate judul via API (OpenAI) → edit judul & tanggal → Add to Queue. Metadata baru (target audience, country, CTA mode/manual CTA) ikut dikirim ke backend dan ditampilkan di modal edit. Tidak ada auto‑load hasil push; setiap klik Generate selalu memanggil backend.
  - Idempotency: plugin selalu menambahkan suffix acak pada Idempotency‑Key sehingga setiap submit membuat job baru (tidak mereplay job sebelumnya meskipun input identik).
- Publishing Queue: daftar antrian artikel (default filter Pending); inline edit; Run Generation (background via Jobs API) dengan progress ringkas; strict success (rollback bila gambar gagal); tombol Reset Stuck (processing > 5m); opsi Retry (No images).
- Logs: catat semua panggilan API (status code, request_id) dan ekspor CSV
 - Media: gambar featured disimpan dengan nama file bermakna (slug post + `.jpg`), ALT diisi dari judul post.

## Persyaratan & Lingkungan Docker
- WordPress berjalan dalam container `web_wordpress`
- Akses aplikasi WP: `http://wpdroposting.local` — gunakan dari hosts maupun dari dalam container.
- Backend Droposting (API): `http://droposting.local/api/v1` — gunakan dari hosts maupun dari dalam container.
- MariaDB berjalan pada container `web-mariadb`

Lint plugin:
```
docker compose exec web_wordpress bash -lc "php -l wordpress/wp-content/plugins/wpdroposting/index.php"
```

Akses database WordPress:
```
docker exec -it web-mariadb mysql -h db -P 3306 -u appuser -pchange_me_user wordpress
```

## Instalasi & Aktivasi
1. Salin folder plugin ke `wp-content/plugins/wpdroposting`
2. Aktifkan plugin melalui WP Admin → Plugins
3. Aktivasi membuat/memperbarui tabel:
   - `${prefix}wpdroposting_logs`
   - `${prefix}wpdroposting_queue` (dengan kolom `backend_job_id`, `backend_status`, `last_progress`, `last_request_id`, `consumed`, `consumed_at`, `wp_post_id`)
   - Runner cron periodik enqueue+poll untuk batch; Run Now melakukan enqueue dan UI melakukan polling status

## Konfigurasi (Settings)
Set API Endpoint ke `http://droposting.local/api/v1` (gunakan dari hosts maupun dari dalam container). Atur Timeout sesuai kebutuhan (default 30s). Opsi tambahan: Xendit Callback Token (mock) untuk tombol Simulate Payment.

## Lisensi & Billing (License)
- Registrasi trial kini diproses di langkah Welcome wizard (lihat bawah) yang memanggil `/auth/register-site` → `/auth/verify-site`. Tab License mempertahankan form lama untuk pengguna existing yang sudah punya license key manual.
- Masukkan License Key → Verify (memanggil `/license/verify`). Jika lisensi valid dan domain belum terikat, backend akan bind domain.
- Login ulang dari instalasi baru menggunakan form Welcome → `/auth/login-site`; wizard akan meminta OTP ulang jika site belum diverifikasi.
- Unbind License: memanggil `/license/unbind` (dibatasi backend 1×/30 hari)
- Upgrade / Checkout: pilih plan (BASIC30/PRO60) → panggil `/checkout/session` dan redirect ke `checkout_url`
- Status yang ditampilkan:
  - Usage summary (`/usage/summary`)
  - Subscription detail (`/subscription`): status, plan, provider, periode
  - Recent events (`/events`): 10 event terakhir (type, time, request_id)
- Resume All Paused Schedules: ketika subscription `active`, tombol ini mengubah semua jadwal `paused_need_upgrade` menjadi `active` dan menjadwalkan `next_run` berikutnya

## Onboarding Wizard
- Wizard kini dibuka dengan Welcome gate yang memaksa register/login akun Droposting sebelum langkah License muncul. Panel Register mengumpulkan nama, email, password, dan menampilkan `home_url()` secara read-only; submit memanggil `/auth/register-site` lalu berpindah ke form OTP 6 digit dengan tombol Resend (maks 5×/hari). Panel Login memakai email+password + `home_url`, memanggil `/auth/login-site`, dan otomatis mengembalikan OTP step jika site belum diverifikasi.
- Setelah kode diverifikasi (`/auth/verify-site`), wizard menyimpan license key di `wpdrop_wizard_state.auth`, menampilkan banner sukses, dan mengizinkan akses ke langkah License/Scan selanjutnya. Endpoint `wp-json/wpdroposting/v1/site/ping` otomatis menjawab `{ "ok": true }` untuk handshake domain saat backend memverifikasi instalasi. Pengguna dapat memicu forgot password langsung dari Welcome gate (mengirim `/auth/forgot-password` dan mencatat instruksi reset).
- Wizard selanjutnya memandu site scan, manual insights, pembuatan template, dan penjadwalan otomatis. Formulir site scan menerima hingga tiga URL prioritas lengkap dengan validasi, status progres (queued/running/succeeded/failed), serta blokir tombol Next sampai rekomendasi tersedia. Hasil scan menyertakan topic insight (micro-brief) dan 8–12 keyword frase panjang yang sudah di-de-dupe, sehingga rekomendasi template variatif. Sukses/failed state menampilkan detail token usage, URL yang dipindai, dan pesan error terperinci (mis. lisensi belum valid). Detail job, milestone, dan penggunaan token dibagikan dengan backend sehingga dashboard & wizard konsisten. Roadmap lanjutan (peningkatan prompt, pengujian otomatis) terdokumentasi di `docs/site-assistant-scan-plan.md`.

## Templates (CPT `aag_template`)
Simpan konfigurasi template (mengambil pilihan master dari backend):
- Input: Topic (default), Keyword (default), Title must include keyword? (Yes/No; default Yes), Tone, Language, Length
- Images: Featured (enable) + Image Orientation (square|landscape|portrait) + Image Style (from backend `image_styles`, default Minimalist)
- Use internal link: Yes/No (default No)
- Post: author (user), categories (WP terms), status (draft/publish/pending/private)

Template management (Tab Templates):
- Inline New/Edit: formulir edit ditampilkan langsung di tab Templates (tidak pindah ke layar CPT bawaan).
- Duplicate: menggandakan template beserta semua konfigurasi (`_wpdrop_*`), judul akan diberi suffix " - Copy".
- Delete dengan validasi:
  - Hard delete bila template belum pernah dipakai (tidak ada keterkaitan dengan queue/schedules).
  - Soft delete (non-aktif) bila sudah dipakai/terhubung. Tersedia tombol Restore untuk mengaktifkan kembali.
- Filter: Aktif (default) / Non Aktif untuk mempermudah pengelolaan.

## Generate (Single)
- Pilih template dan isi Topic (Title opsional; AI akan mengisi jika kosong)
- Plugin mengirim `template_meta` ke `/generate` yang mencakup context, prompts, images, dan default post
- Preview hasil: title, excerpt, html, featured image
  - Jika "Use internal link" aktif pada template, di akhir konten ditambahkan baris: `Related : <link>` (link ke posting published terbaru saat generate)
- Insert as New Post: membuat post dengan author/categories/status sesuai template, menyetel tags, dan men-sideload gambar ke media library

## Generate Bulk (Titles)
- Pilih Template (hanya template aktif yang tampil), tentukan jumlah judul (maks 400; default 5), serta jadwal (mulai, setiap X hari, jam).
- Klik Generate Titles → tabel preview muncul untuk edit; lalu Add to Queue.
- Hindari duplikasi judul: plugin mengirim 60 judul artikel terakhir ke backend (avoid_titles) agar model tidak menghasilkan judul yang sama; backend juga memfilter jika ada duplikasi
- Keyword diambil dari Template (default) — tidak ada field keyword di form. Pastikan Template memiliki keyword default.
- Backend menggunakan OpenAI Responses API (JSON Schema) untuk memaksa keluaran JSON `{titles:[...]}` dan menambahkan fallback pemrosesan bila model tidak patuh.

Template Overview (hemat ruang):
- Setelah memilih template, panel ringkas akan muncul di bawah dropdown menampilkan ringkasan konfigurasi (Topic/Keyword/Tone/Language/Length, featured image + orientation + style, use internal link, author, categories, status). Berguna untuk memastikan pemilihan template.
- Validasi tanggal: Start Date hanya boleh mundur maksimal 2 hari dari hari ini (lebih lama akan ditolak).

## Publishing Queue
- Tabel antrian menampilkan item (default filter Pending). Bisa:
  - Edit Title/Date/Time untuk item Pending → Update
- Run Generation (background): enqueue `/jobs/generate` → polling `/jobs/{id}` → fetch `/jobs/{id}/result` → ACK `/jobs/{id}/ack`
- Poll Now: per item, memaksa 1 siklus polling + konsumsi hasil. Dilengkapi idempotency per row, perbaikan status done, dan set featured image instan (set_post_thumbnail + _thumbnail_id + metadata) untuk meminimalkan jeda tampilan
  - Select All + Delete Selected untuk menghapus
- Jika status `Done` dan sudah ada `wp_post_id`, judul di kolom Title menjadi tautan ke layar edit post (`post.php?post={id}&action=edit`).
- Single processing: hanya satu item yang diproses pada satu waktu. Cron hanya men‑enqueue 1 item (yang paling overdue) jika tidak ada proses berjalan; AJAX Run Generation juga menolak jika ada proses lain yang sedang berjalan.
- Prioritas jadwal: cron memilih item dengan `scheduled_at <= now()` paling lama terlebih dahulu (overdue didahulukan), lalu mem‑poll/consume hingga selesai sebelum melanjutkan.
- Recovery: bila ada item `processing` tanpa `backend_job_id` (stuck), cron mencoba re‑enqueue secara otomatis; bila gagal akan ditandai failed.

## Health
- Menampilkan status `image_styles` dari backend `/templates/config`: OK (jumlah styles), Missing (tidak dikirim backend), atau Error (gagal memuat endpoint).

## Logs
- Tab Logs menampilkan catatan panggilan API terbaru (dengan request_id) dan menyediakan tombol Export CSV
- Pagination bawaan (25 baris per halaman) + tombol “View” untuk melihat context JSON mentah

## Troubleshooting
 - Pastikan `API Endpoint` menunjuk ke `http://droposting.local/api/v1` (plugin juga fallback otomatis dari `droposting.local` → `web-droposting` untuk menghindari timeout DNS di dalam container)
 - Cek Logs tab untuk status code dan `request_id` dari backend
 - Jika antrian tidak muncul: pastikan tabel `${prefix}wpdroposting_queue` ada (aktivasi plugin atau buka halaman admin agar auto‑ensure berjalan)
 - Jika gambar tidak muncul di browser, gunakan endpoint host‑based di backend (`APP_URL=http://<HOST_IP>:<PORT>`) dan pastikan `php artisan storage:link` sudah dijalankan.
 - Gunakan Health tab → Test Image Generation dan Test Jobs (enqueue+process+fetch) untuk memverifikasi koneksi, kredensial, serta pemrosesan job backend.

### Catatan Kinerja (backend v2)
- Backend kini menangani auto‑retry kegagalan transient (TIMEOUT/IMAGE_GENERATION_FAILED) dengan backoff bertahap (15m, 30m, 45m, 60m, 75m) hingga batas percobaan.
- Pemrosesan dilakukan bertahap (staging): teks disimpan terlebih dulu; bila image gagal, job akan di‑resume hanya tahap image (konten teks tidak diulang), sehingga lebih efisien.
- Scheduler backend memproses batch kecil (±3 job/menit) dan aman untuk multi‑worker. Plugin tetap memiliki “tick” AJAX agar antrean bergerak saat tab admin Publishing Queue terbuka, namun backend bekerja mandiri di background.

## Scheduler & Single‑Processing (Update)
- Interval WP‑Cron: runner `wpdroposting_run_queue_event` dan scanner berjalan setiap 5 menit (schedule key `five_minutes`).
- Enforce single job: plugin sekarang memastikan hanya SATU item diproses pada satu waktu.
  - Enqueue: hanya 1 pending yang dipromosikan ke `processing` saat idle.
  - Poll/consume: hanya 1 in‑flight yang diproses per siklus.
  - Sinkronisasi antar jalur (cron + AJAX) memakai advisory lock database untuk mencegah race.
- Admin terbuka: AJAX tick tetap berjalan, tetapi mengikuti aturan single‑processing di atas.

## Push dari Backend (Rekomendasi Arsitektur)
- Untuk mempercepat sinkronisasi, disarankan menambah endpoint “push” di WordPress (admin‑post) yang menerima notifikasi dari backend ketika job `succeeded`.
- Push memicu fetch `/jobs/{id}/result` dan insert post segera, sementara WP‑Cron/AJAX tetap menjadi fallback jika push gagal.
- Keamanan: gunakan token/HMAC per website untuk memverifikasi push; backend menyimpan outbox dan retry dengan exponential backoff.
# wpdroposting — WordPress Plugin

Client plugin for Droposting backend. Provides bulk title generation, queue scheduling, auto posting, and health checks.

## Highlights
- Publishing Queue polling of processing items ignores scheduled_at (manual “Run Generation” will complete even if the date is in the future).
- Manual “Run Generation” ignores schedule/order but still enforces single-processing (one item at a time) to avoid race conditions.
- Article normalization is backend-only; plugin inserts `post_content` directly from backend’s cleaned HTML. Backend may run two‑pass text generation (content → extractive SEO) to improve consistency without extra plugin changes.
 - Backend enforces no-stub policy: if content is empty/too short, backend fails with `TEXT_GENERATION_EMPTY` (API) or marks job failed. Plugin should show the error and allow retry.
 - Retry failed (every 5 minutes) without user action; backend also triggers HMAC retry.
- Settings include API Endpoint and License Key
- Bulk Titles generation is async and resilient (polling with progress bar)
- Preview persists until user clears (Add to Queue or Generate Again)
- Avoid list is centralized via backend `/templates/config` and includes:
  - Last N published posts (ENV `TITLES_AVOID_POSTS_LAST`)
  - Last M queue items with scheduled_at < Start Date (ENV `TITLES_AVOID_QUEUE_BEFORE`)
  - Next K queue items with scheduled_at >= Start Date (ENV `TITLES_AVOID_QUEUE_AFTER`)
- The plugin sends the full avoid list to backend; backend does not truncate

## Developer Notes
- Backend hardening (Sept 2025): article generation uses JSON Schema, nested JSON inside `html` is decoded server-side, HTML is cleaned (no `<img>`, no boilerplate lines, no stray `n`), and truncated endings trigger a safe continuation pass. Length controlled by `min_words` and backend ENV (`TEXT_MAX_TOKENS_CAP`, `TEXT_TOKENS_PER_WORD`).
 - Retry tick: `wpdroposting_retry_failed_event` (5 menit) → untuk setiap row `failed`:
   - Bila backend job `succeeded` → fetch `/jobs/{id}/result` + insert post → update `backend_status='succeeded'` → ACK `/jobs/{id}/ack` (menandai sinkronisasi di backend) → DONE.
   - Jika belum `succeeded` → re‑enqueue segera via `/jobs/generate` (status PROCESSING) — mengabaikan tanggal schedule.
 - HMAC endpoints:
   - `admin-post.php?action=wpdrop_job_push` (titles/content) — realtime insert saat push sukses.
   - `admin-post.php?action=wpdrop_retry_failed_now` — memicu retry tick tanpa WP‑Cron. Dipakai oleh backend scheduler.
- Bulk preview is stored per-user via usermeta (not transient with TTL) to avoid disappearing results when idle.
- Health tab displays server time (WP) and backend time for diagnostics.
- Progress bar indicates status while fetching titles.

## Push Receiver (Titles)
- The plugin exposes `admin-post.php?action=wpdrop_job_push` (and nopriv variant) which accepts signed push from backend.
- Security: HMAC SHA-256 with the site License Key; includes timestamp and request_id headers.
- On receiving a Titles `succeeded` push, the plugin calls backend `GET /titles/{job_id}` and buffers items. The Bulk tab shows a "Load Push Results" prompt (no auto-load) when a buffer exists. After loading, the plugin calls `POST /titles/{job_id}/ack` to mark consumed in the backend.

## Idempotency (Bulk Enqueue)
- The bulk titles enqueue adds an `Idempotency-Key` header to prevent duplicate jobs on double-click/retry.
