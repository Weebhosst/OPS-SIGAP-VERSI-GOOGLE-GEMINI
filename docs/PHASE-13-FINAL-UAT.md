# OPS SIGAP — PHASE 13 FINAL REGRESSION & UAT GATE

Status: **UAT CANDIDATE**

Branch: `uiux-v2-refactor`

Tujuan phase ini adalah membuktikan bahwa perubahan UI/UX Phase 1–12 tidak merusak business logic, role/permission, alur patroli, QR, GPS/radius, kamera, serah terima, insiden, galeri, autentikasi, dan workspace monitoring.

## 1. Aturan Gate

Release Candidate hanya boleh dinyatakan **PASS** jika:

- `npm run uat:gate` selesai tanpa error.
- Tidak ada blocker atau critical regression.
- Tidak ada permission leak antar role.
- ANGGOTA dapat menyelesaikan alur operasional utama dari HP.
- CHIEF tetap read-only dan nyaman digunakan di HP.
- SUPER_ADMIN dapat menggunakan seluruh back-office utama di desktop.
- Kamera, QR scanner, GPS, radius validation, dan upload foto bekerja dari HTTPS.
- Tidak ada horizontal overflow yang memutus fungsi utama pada viewport 360px–430px.
- Dialog penting dapat dibuka, dibaca, discroll, dan ditutup.
- Navigasi aktif, route restore, logout, dan password rotation tetap benar.

## 2. Automated Gate

Jalankan dari root repository:

```powershell
npm run uat:gate
```

Perintah ini menjalankan secara berurutan:

```text
npm run lint
npm test
npm run build
```

Expected:

- TypeScript compile check: PASS
- Domain tests: PASS
- Repository tests: PASS
- Media storage unit tests: PASS
- Security integration tests: PASS
- Vite production build: PASS

Jika salah satu gagal, status Phase 13 = **BLOCKED** sampai penyebab diperbaiki.

## 3. Environment Safety Check

Sebelum UAT dengan aksi tulis:

1. Pastikan aplikasi yang diuji memang instance development/local.
2. Periksa konfigurasi database dan media storage.
3. Jika `DATABASE_URL` atau konfigurasi lain mengarah ke production, jangan melakukan reset, delete, force-close, create master data, atau manipulasi data UAT sembarangan.
4. Untuk pengujian HP lintas jaringan, gunakan HTTPS Cloudflare Quick Tunnel menuju localhost.

Contoh:

```powershell
npm run dev
cloudflared tunnel --url http://localhost:3000
```

## 4. UAT — AUTHENTICATION

### AUTH-01 Login Valid

- Masukkan NPK dan password valid.
- Expected: login sukses dan diarahkan ke workspace sesuai role.

### AUTH-02 Login Invalid

- Masukkan password salah.
- Expected: login ditolak dengan pesan yang jelas.
- Tidak boleh ada session aktif.

### AUTH-03 Forced Password Rotation

- Gunakan akun dengan `mustChangePassword=true`.
- Expected: workspace tidak dapat digunakan sebelum password diganti.
- Password baru minimal 8 karakter, mengandung huruf dan angka, dan tidak sama dengan NPK.

### AUTH-04 Logout

- Logout dari tiap role.
- Expected: session dicabut dan halaman kembali ke Login.

## 5. UAT — ANGGOTA MOBILE

Target viewport: **360px, 390px, 412px/430px**.

### MEMBER-01 Dashboard

Expected:

- Identitas/site/shift terbaca.
- Status patrol dan progress tampil benar.
- Bottom navigation tidak menutup konten.
- Tidak ada horizontal scroll.

### MEMBER-02 Start Shift / Sertigas Naik Jaga

Expected:

- Dokumentasi awal tampil bila diwajibkan.
- Kamera dapat dibuka.
- Foto dapat diambil.
- Session hanya dimulai sesuai rule existing.

### MEMBER-03 Patrol Checkpoint

Untuk minimal satu checkpoint:

1. Buka Patrol.
2. GPS berhasil diperoleh.
3. Scan QR.
4. Ambil foto.
5. Pilih status AMAN/TEMUAN/INSIDEN.
6. Submit.

Expected:

- QR benar diterima.
- GPS dan akurasi tercatat.
- Foto tampil pada review.
- VALID checkpoint menambah progress.
- Duplicate checkpoint mengikuti rule existing.

### MEMBER-04 Radius Rejection

- Uji kondisi di luar radius atau simulation control development.

Expected:

- Scan ditolak/review sesuai logic existing.
- Tidak mengubah checkpoint menjadi VALID secara salah.
- Pesan rejection tampil jelas.

### MEMBER-05 Incident

Expected:

- Form dapat discroll di HP.
- Input penting dapat diisi.
- Foto dapat diambil.
- Submit menghasilkan incident sesuai data yang dimasukkan.

### MEMBER-06 Serah Terima

Expected:

- Sertigas dan serah-terima barang/TARUNA dapat dibuka.
- Foto dan catatan berfungsi.
- Tidak ada field/tombol terpotong viewport.

### MEMBER-07 Gallery & Profile

Expected:

- Media dapat dibuka.
- Preview modal tidak terpotong.
- History/profile dapat dibaca.
- Logout tetap bekerja.

## 6. UAT — CHIEF MOBILE

Target utama: **HP 360px–430px**.

### CHIEF-01 Monitor Operasional

Expected:

- KPI 2 × 2.
- Patroli Aktif satu kolom.
- Alert Validasi tidak horizontal-scroll.
- Kejadian Prioritas dan Serah Terima terbaca.
- Filter dapat dibuka dan diterapkan.

### CHIEF-02 Navigation

Expected menu:

- Monitor
- Session
- Mutasi
- Insiden
- Galeri
- Profil

Semua menu harus dapat dibuka tanpa route error.

### CHIEF-03 Read-only Enforcement

Expected:

- Chief dapat melihat monitoring.
- Chief tidak boleh memperoleh aksi mutation Administrator.
- Endpoint write yang tidak diizinkan tetap ditolak server.

## 7. UAT — SUPER_ADMIN DESKTOP

Target viewport: **1366 × 768 atau lebih besar**.

### SA-01 Desktop Shell

Expected:

- Sidebar tampil.
- Bottom navigation desktop tersembunyi.
- Active menu jelas.
- Workspace memanfaatkan lebar desktop.

### SA-02 Command Center

Expected:

- KPI, active patrol, alerts, incident, handover, media tampil.
- Filter global bekerja.
- Detail alert dapat dibuka.

### SA-03 Master Monitoring

Expected:

- Customer/Site.
- Personnel.
- Checkpoint.
- Active Session.

Filter/search/tab harus tetap bekerja.

### SA-04 Petugas

Expected:

- Filter Customer/Site bekerja.
- Tambah petugas dapat dibuka.
- Reset password dialog benar.
- Status ACTIVE/INACTIVE sesuai permission.

### SA-05 Checkpoint

Expected:

- Filter Customer/Site.
- Add/Edit checkpoint.
- Coordinate/radius.
- Generate Token.
- Generate QR.
- View QR.
- Download kartu.

Jangan melakukan perubahan terhadap production selama UAT lokal.

### SA-06 Radius Calibration

Expected:

- Histori tampil.
- Modal tambah uji dapat dibuka.
- VALID/REJECTED mudah dibedakan.

### SA-07 Audit Trail

Expected:

- Search bekerja.
- Log panjang dapat dibaca tanpa memecahkan layout.
- Timestamp/action/entity/reason terlihat.

## 8. RESPONSIVE & ACCESSIBILITY GATE

Periksa minimal:

- 360px mobile
- 390px mobile
- 430px mobile
- 768px tablet
- 1366px desktop

Expected:

- Tidak ada horizontal page overflow.
- Touch target utama mudah ditekan.
- Focus ring terlihat dengan keyboard.
- Tab key dapat mencapai action utama.
- Modal mempunyai role dialog/alertdialog yang sesuai.
- Close button memiliki accessible label.
- Bottom navigation menghormati safe area HP.
- Konten tetap dapat discroll pada keyboard terbuka/viewport pendek.

## 9. PWA / NETWORK REGRESSION

- Offline banner tidak menghalangi navigasi.
- Install PWA tetap dapat dipanggil jika browser mendukung.
- Refresh halaman tidak menghilangkan authorized route secara salah.
- Route terakhir dipulihkan sesuai role.
- Cloudflare Quick Tunnel HTTPS dapat mengakses kamera dan geolocation jika permission browser diberikan.

## 10. Severity

### BLOCKER

- Tidak bisa login.
- Crash/blank screen.
- Data corruption.
- Patrol utama tidak dapat diselesaikan.
- Permission leak.
- QR/GPS/kamera inti tidak bekerja pada perangkat yang didukung.
- Build/test gagal.

### HIGH

- Salah role navigation.
- Checkpoint VALID/REJECTED salah secara UI/flow.
- Form penting tidak bisa submit.
- Modal/tombol kritis tidak dapat dijangkau.

### MEDIUM

- Overflow/layout mengganggu tetapi ada workaround.
- Label/status membingungkan.
- Visual state tidak konsisten.

### LOW

- Spacing minor.
- Copy/ikon kurang rapi.
- Polish non-blocking.

## 11. UAT Result Template

Gunakan format berikut untuk setiap temuan:

```text
ID:
ROLE:
DEVICE:
SCREEN/FLOW:
SEVERITY:
EXPECTED:
ACTUAL:
STEPS TO REPRODUCE:
SCREENSHOT:
STATUS: OPEN / FIXED / RETEST PASS
```

Final sign-off:

```text
AUTOMATED GATE : PASS / FAIL
ANGGOTA MOBILE : PASS / FAIL
CHIEF MOBILE   : PASS / FAIL
SUPER ADMIN    : PASS / FAIL
RESPONSIVE     : PASS / FAIL
ACCESSIBILITY  : PASS / FAIL
BLOCKER        : 0
HIGH           : 0
FINAL STATUS   : RELEASE CANDIDATE / BLOCKED
```
