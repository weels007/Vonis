# Arsitektur Vonis

Pengadilan sengketa untuk agen otonom. Dokumen ini menjelaskan desain kontrak, alasan teknis di balik
setiap keputusan, dan apa yang harus diverifikasi sebelum dipakai dengan uang nyata.

## 1. Masalah dan posisi

Agen otonom bisa membayar, mengerjakan tugas, dan melaporkan hasil. Yang belum ada adalah pihak netral
yang memutuskan apakah hasil kerja memenuhi kesepakatan ketika kedua pihak tidak sepakat — tanpa
menyerahkan keputusan ke platform terpusat.

Vonis menyelesaikan satu hal: **adjudikasi sengketa pekerjaan antara dua agen**, dengan bukti publik,
kriteria tertulis, dan konsekuensi ekonomi (reward, refund, slash stake, reputasi).

Di luar cakupan: pembayaran fiat, KYC, penegakan hukum, dan kepastian hukum escrow.

## 2. Peran

- Requester — membuka kasus, mengunci reward, menetapkan rubrik.
- Provider — agen yang mengerjakan, memasang stake, mengirim bukti.
- Judge — alamat yang di-set saat deploy (deployer). Satu-satunya yang boleh `judge_rule`.
- Validator GenLayer — memverifikasi hasil leader pada setiap adjudikasi.

## 3. Data

Semua storage datar; tidak ada koleksi bersarang di dalam dataclass, untuk menghindari masalah
serialisasi dan alokasi storage generik.

- `Case` — pihak, judul, `spec_url`, `rubric`, `reward`, status, bukti, klaim, verdict, `award_bps`,
  skor, alasan, credit provider/requester, slash, tenggat.
- `Agent` — handle, endpoint, stake, kasus aktif, statistik, skor reputasi (mulai 50).
- `credits[Address]` — saldo yang bisa ditarik (pull payment).

`Case` disimpan di `cases["case-N"]`, `Agent` di `agents[address]` (TreeMap).

## 4. Uang

Tiga kolam terpisah:

- `escrow_total` — reward kasus yang belum diputus.
- `stakes_total` — stake agen yang masih terkunci.
- `credits_total` — dana yang sudah menjadi hak pihak tertentu tetapi belum ditarik.

Alur: `open_case` (payable) menambah escrow; `_finalize` mengurangi escrow dan menambah credits;
`withdraw` menolkan credit lalu mengirim GEN lewat external message `emit_transfer` (selalu
`on='finalized'`).

Kenapa pull payment, bukan kirim langsung saat verdict:

- direct mode tidak bisa meng-emit message, sehingga logika adjudikasi tidak bisa diuji kalau
  pembayaran menempel di jalur yang sama;
- kegagalan external message tidak boleh membatalkan keputusan yang sudah final;
- `withdraw` menolkan credit sebelum emit, sehingga aman dari re-entrancy.

Konsekuensi: pihak yang menang harus memanggil `withdraw`. Frontend wajib menampilkan saldo klaim.

## 5. State machine

```
OPEN --accept_case--> ACCEPTED --deliver_case--> DELIVERED --accept_delivery--> RULED --> SETTLED
  |                                              |
  |                                              +--raise_dispute--> DISPUTED --adjudicate--> RULED
  |                                              |                                            |
  +--cancel_case--> RULED --finalize--> SETTLED  +--(judge_rule)------------------------------+
```

Aturan kunci:

- `accept_delivery` dan `cancel_case` langsung menyelesaikan (tanpa biaya AI).
- `finalize_case` butuh `RULED` dan jendela banding lewat, kecuali hakim (`judge_rule`) yang
  menyelesaikan seketika.
- `UNVERIFIABLE` tidak bisa di-finalize tanpa `judge_rule`.
- `SETTLED` bersifat final; semua jalur lain menolak.

## 6. Adjudikasi

### Nondeterministic block

Kontrak memakai `gl.vm.run_nondet` (bukan `run_nondet_unsafe`) karena test runner direct
mode me-patch fungsi itu; validator di dalamnya sudah menangani setiap error secara eksplisit
(leader yang error atau hasil yang tidak sesuai menghasilkan `False`, bukan exception).

Semua yang menyentuh dunia luar berada di `leader_fn` / `validator_fn`:

1. Ambil teks spesifikasi dari `spec_url` (`gl.nondet.web.get`, dipotong 6000 karakter).
2. Ambil setiap URL bukti (maks 3), dipotong, dibungkus penanda `<<<EVIDENCE n>>>`.
3. Susun prompt: peran, aturan, kasus, spesifikasi, rubrik (N kriteria), klaim, bukti.
4. `gl.nondet.exec_prompt(prompt, response_format="json")`.
5. Normalisasi defensif: ambil objek JSON, validasi enum, clamp angka, paksa N entri kriteria.

Di luar blok: verdict, skor, award, status, reputasi, credit. Tidak ada penulisan storage di dalam
blok; tidak ada panggilan kontrak; tidak ada message.

### Kontrak output dan normalisasi

```json
{
  "verdict": "PROVIDER_AT_FAULT | REQUESTER_AT_FAULT | SHARED | UNVERIFIABLE",
  "award_bps": 0,
  "score": 0,
  "criteria": [{"id": 1, "met": true}],
  "summary": "...",
  "injection_suspected": false
}
```

`award_bps` adalah porsi reward milik provider. Normalisasi memaksa konsistensi:

- `PROVIDER_AT_FAULT` → award ≤ 3000
- `REQUESTER_AT_FAULT` → award ≥ 9000
- `SHARED` → 3001..8999
- jumlah entri `criteria` selalu sama dengan jumlah baris rubrik (pad `false`, truncate)

Konsistensi ini penting agar validator membandingkan angka yang bermakna, bukan keluaran LLM mentah
yang bisa saja berkata "provider salah" tetapi memberi 100%.

### Yang dibandingkan validator

- `verdict` — harus identik.
- `award_bps` — toleransi ±1500 bps.
- `score` — toleransi ±15.
- `criteria[].met` — harus identik per kriteria, berurutan.
- `injection_suspected` — harus identik.

Tidak dibandingkan: `summary` (teks bebas selalu berbeda).

Ambang ini titik awal, bukan dogma. Kalibrasi di Studio mode dengan `analyze(runs=100)` pada rubrik
uji; target agreement ≥95%. Jika di bawah 90%, perbaiki prompt/rubrik, bukan melonggarkan toleransi.

### Prompt injection

- Bukti hanya URL; agen tidak bisa menempelkan instruksi langsung ke prompt.
- Konten bukti tetap tak terpercaya: dibungkus penanda, ada instruksi eksplisit untuk tidak
  mengikutinya, output dibatasi enum/angka.
- `injection_suspected` harus sama antar validator; jika true, `adjudicate` menulis
  `UNVERIFIABLE` dengan award 0 dan alasan eksplisit — tidak ada auto-settle.
- Rubrik tidak bisa diubah setelah kasus dibuka.

## 7. Settlement dan slashing

- `PROVIDER_AT_FAULT` → `award_bps` (≤3000) ke provider, sisanya refund; stake provider dipotong
  `SLASH_BPS` (20% dari reward, maksimal sebesar stake) dan dialihkan ke requester.
- `REQUESTER_AT_FAULT` → 100% (atau sesuai award ≥9000) ke provider.
- `SHARED` → pembagian sesuai award.
- `UNVERIFIABLE` → tidak ada pembayaran sampai hakim memutus.

`withdraw_stake` diblokir selama agen punya kasus aktif. `deposit_stake` hanya untuk agen terdaftar.

Reputasi: award ≥9000 → `cases_won+1`, skor +5; award ≤3000 → `cases_lost+1`, skor −10;
kasus `CANCELLED` tidak mengubah reputasi. Skor dibatasi 0..100.

## 8. Batas dan validasi

- Judul ≤ 140, `spec_url` ≤ 500 (http/https), rubrik ≤ 3000 (maks 8 kriteria), klaim ≤ 1200,
  evidence ≤ 900 karakter dan ≤ 3 URL, URL ≤ 500.
- Tenggat memakai timestamp transaksi (`datetime.now(timezone.utc)`), bukan jam dinding. Transaksi
  bisa dieksekusi beberapa menit setelah dikirim; tenggat sebaiknya tidak terlalu ketat.
- `open_case` menolak `value == 0`, provider yang sama dengan requester, dan provider yang belum
  terdaftar.

## 9. Strategi pengujian

Direct mode (in-memory, CI):

- Registry dan stake: registrasi, deposit, penarikan, blokir saat ada kasus aktif.
- State machine: semua transisi, akses per peran, tenggat, URL tidak valid, jumlah URL.
- Settlement: jalur cepat, cancel, verdict penuh/sebagian, slash, double finalize.
- Kegagalan: HTTP 500 pada spesifikasi, verdict tidak dikenal, non-party, adjudikasi tanpa sengketa.
- Konsensus: `run_validator()` setuju/tolak untuk verdict, skor, award, kriteria, flag injeksi, dan
  leader yang error.

Studio mode (menyusul, butuh localnet/Studionet):

- Satu alur penuh dengan validator nyata.
- Satu banding lewat `judge_rule`.
- `analyze(runs=100)` untuk mengukur agreement dan menyeimbangkan toleransi.
- Uji `withdraw` dan external message, yang tidak bisa diuji di direct mode.

## 10. Deploy

1. Pin hash `Depends` SDK di baris pertama `contracts/vonis.py` sesuai versi CLI yang dipakai.
2. `genvm-lint check contracts/vonis.py` (bagian dari CLI) sebelum deploy.
3. `genlayer network set studionet`, lalu
   `genlayer deploy --contract contracts/vonis.py`.
4. Verifikasi `genlayer schema <addr>`, baca `get_case_count()`, dan jalankan satu kasus kecil
   end-to-end.
5. Untuk Bradbury: cek chain id 4221, faucet, dan estimasi fee tulis termasuk `messageAllocations`
   untuk `withdraw`.
6. Catat alamat, jaringan, hash commit, dan biaya nyata di sini.

Deployer menjadi hakim. Untuk produksi, alamat hakim sebaiknya multisig/DAO, bukan EOA personal —
ini keputusan desain yang sengaja dibuat sederhana untuk MVP dan harus diganti sebelum nilai
ekonomi signifikan.

## 11. Batasan yang diketahui

- **Satu hakim** (deployer). Belum ada multi-hakim, pemilihan acak, atau banding berlapis.
- **Tanpa indexer**: daftar kasus dibaca dari `case_count` + `get_case_*`; cukup untuk MVP,
  tidak untuk volume besar.
- **Direct mode tidak mendukung pesan keluar**, sehingga `withdraw` hanya bisa diuji di Studio.
  Itu alasan ledger kredit dipisahkan dari emission.
- **Nilai external message yang gagal** tidak otomatis kembali (batasan protokol). Karena itu credit
  dinolkan sebelum emit dan riwayat payout disimpan on-chain untuk rekonsiliasi manual.
- **Biaya AI/konsensus** belum diukur; estimasi nyata harus diambil di Bradbury sebelum menjanjikan
  harga ke pengguna.
- **Verifikasi tipe kecil** (`u8`/`u16`) sengaja dihindari; kontrak memakai `u256`/`i32`.
- **API event** (`gl.chain.Event`) belum dipakai; perlu diverifikasi sebelum menambah event.

## 12. Roadmap

- M1: frontend baca/tulis (genlayer-js), halaman kasus, estimasi fee, tampilan verdict per kriteria.
- M2: Studio-mode test suite + kalibrasi prompt/agreement rate.
- M3: deploy Studionet → Bradbury, ukur biaya dan latensi, dokumentasikan.
- M4: reputasi lintas aplikasi, daftar agen, template rubrik, multi-hakim.
