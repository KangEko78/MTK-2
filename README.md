# Simulasi TKA Matematika SMP

Front end mempertahankan bank 30 soal, tampilan, timer, penanda ragu-ragu, alur selesai, dan analisis siswa yang sudah dibuat. Data akun, jawaban, dan hasil disimpan melalui Vercel API ke Google Apps Script dan Google Sheets.

## File

- `public/index.html` — antarmuka simulasi dan bank soal yang sudah ada.
- `api/simulation.js` — penghubung privat dari Vercel ke Apps Script.
- `apps-script/Code.gs` — login, sesi bertanda tangan, simpan jawaban, lanjutkan sesi, dan simpan ringkasan hasil.

## Menyiapkan Google Sheets dan Apps Script

1. Buat Google Sheet khusus sekolah dan pastikan hanya guru/pengelola yang dapat membukanya.
2. Dari sheet, pilih **Ekstensi → Apps Script**, lalu ganti isi `Code.gs` dengan file pada folder `apps-script`.
3. Simpan proyek, pilih fungsi `setupTkaSheets`, lalu jalankan dan berikan izin akses spreadsheet. Ini membuat tab `Accounts`, `AnswerLog`, `Results`, `Violations`, dan `PinDistribution`; kolom integritas pada `Results` juga diperbarui.
4. Kembali ke spreadsheet dan muat ulang. Dari menu **Simulasi TKA**, pilih **Buat rahasia API**. Fungsi ini menyimpan `VERCEL_SHARED_SECRET` dan `SESSION_SECRET` secara otomatis di Script Properties; salin nilai `VERCEL_SHARED_SECRET` dari dialog untuk dipasang di Vercel sebagai `TKA_SHARED_SECRET`. `SESSION_SECRET` tetap tersimpan di Apps Script.
5. Masukkan daftar siswa di tab `Accounts`: isi `full_name`, `class`, `role` (`student`), dan `active` (`TRUE`); biarkan `password_hash` kosong. `username` boleh dikosongkan; sistem akan membuat kode internal saat PIN dibuat.
6. Dari menu **Simulasi TKA**, pilih **Buat PIN unik untuk akun siswa**. PIN 8 angka dibuat untuk setiap akun siswa aktif. PIN yang sudah ada di kolom `pin` pada `PinDistribution` tetapi belum dipasangkan akan dipakai terlebih dahulu. Hash disimpan di `Accounts`; tab `PinDistribution` mencatat PIN dan nama siswa. Bagikan setiap PIN kepada siswa secara privat dan batasi akses tab tersebut.
7. Pilih **Deploy → New deployment → Web app**. Jalankan sebagai akun pengelola dan izinkan akses web app. Salin URL yang berakhir dengan `/exec`.

`Results` mencatat nama/kelas, skor total, dan capaian tiap elemen. `AnswerLog` menyimpan jawaban per nomor dan penanda ragu-ragu. Jangan membagikan spreadsheet kepada siswa.

## Menyiapkan Vercel

1. Impor folder `tka-live` sebagai proyek Vercel; folder ini adalah root proyek. Tidak diperlukan framework atau paket tambahan.
2. Tambahkan environment variables:
   - `APPS_SCRIPT_URL`: URL web app Apps Script `/exec`.
   - `TKA_SHARED_SECRET`: nilai yang sama dengan `VERCEL_SHARED_SECRET` pada Apps Script.
3. Deploy. Saat mengganti environment variables, lakukan redeploy agar perubahan aktif.

Alur siswa: guru mendaftarkan nama siswa, membuat PIN unik melalui menu **Buat PIN unik untuk akun siswa**, lalu memberikan PIN secara privat sesuai nama di tab `PinDistribution`. Siswa memasukkan nama lengkap terdaftar dan PIN pribadi 8 angka di halaman CBT. CBT mencocokkan nama, PIN, dan status akun aktif; PIN harus diberikan oleh guru, tidak ditampilkan berdasarkan pencarian nama. Apps Script hanya menyimpan hash PIN di `Accounts`. Batasi akses ke tab `PinDistribution` dan hapus nilai PIN setelah distribusi selesai. Jawaban tersimpan saat dipilih, dapat dipulihkan setelah halaman dimuat ulang pada browser yang sama, dan hasil dicatat saat siswa menyelesaikan sesi.

## Catatan penggunaan

Ini adalah simulasi latihan. Saat login, aplikasi meminta layar penuh dan akses kamera. Kamera menampilkan video live lokal pada perangkat siswa saja, tanpa audio, perekaman, penyimpanan, atau pengiriman ke backend. Keluar tab dijeda dan dicatat; pada deteksi keluar tab kedua, server menghentikan sesi dan menetapkan nilai 0, halaman otomatis menampilkan hasil 0 dan membunyikan sirine singkat saat terlihat kembali. Keluar layar penuh atau mematikan kamera tetap menjeda sesi dan dicatat, tetapi tidak menambah hitungan keluar tab. Setelah pelanggaran pertama, siswa dapat melanjutkan; perpindahan tab berikutnya tetap dihitung walau dialog jeda masih terbuka.

Browser biasa tidak dapat mencegah siswa membuka perangkat lain atau menjamin halaman selalu fullscreen. Pengamanan ini mendeteksi perpindahan tab dan keluarnya fullscreen, lalu menjeda serta mencatatnya. Untuk ujian berisiko tinggi, gunakan perangkat terkelola/kiosk atau aplikasi secure-exam browser. Kamera di implementasi ini tidak terlihat oleh guru karena stream tidak dikirim ke server. Akses kamera memerlukan HTTPS atau localhost dan izin kamera dari browser.

Untuk ujian berisiko tinggi, pindahkan kunci jawaban dan penilaian ke server sebelum digunakan karena bank soal pada halaman latihan dapat diperiksa dari browser.
