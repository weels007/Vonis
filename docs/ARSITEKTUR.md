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

- Lint struktural (`tests/test_lint.py`), tanpa SDK: header `Depends` ada, storage memakai tipe
  GenVM (`TreeMap`, bukan `dict`), method publik tidak memanggil `gl.nondet`, `leader_fn` tidak
  menulis storage/emit pesan, `Case` menyimpan field yang dibaca frontend, dan `__receive__`
  payable.
- Registry dan stake: registrasi, deposit, penarikan, blokir saat ada kasus aktif.
- State machine: semua transisi, akses per peran, tenggat, URL tidak valid, jumlah URL.
- Settlement: jalur cepat, cancel, verdict penuh/sebagian, slash, double finalize.
- Kegagalan: HTTP 500 pada spesifikasi, verdict tidak dikenal, non-party, adjudikasi tanpa sengketa.
- Konsensus: `run_validator()` setuju/tolak untuk verdict, skor, award, kriteria, flag injeksi, dan
  leader yang error.
- Adversarial (`tests/test_adversarial.py`): bukti berisi instruksi (dikuarantina menjadi
  `UNVERIFIABLE`), award tidak konsisten dengan verdict (di-clamp), JSON berpagar markdown,
  trailing comma, array JSON, verdict alias/lowercase, award non-numerik, kriteria kosong/lebih
  dari 8, evidence kebesaran, dan kredit milik pihak lain.
- Integration (`tests/test_integration.py`): dua kasus penuh berurutan (jalur cepat + sengketa),
  invariant `escrow_total`/`credits_total`/`stakes_total`, status `SETTLED`, dan payload
  `get_case_json`.

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

## 12. Audit fitur GenLayer

Ditinjau terhadap seluruh kemampuan yang didokumentasikan GenLayer, dengan kriteria: apakah
menambah kebenaran keputusan, keamanan dana, atau kelayakan produk.

**Sudah dipakai**

- Nondeterministic block + `gl.vm.run_nondet` dengan validator kustom dan toleransi eksplisit.
- Web access (`gl.nondet.web.get`) dengan pemotongan konten dan penanganan status lintas layout SDK.
- LLM terstruktur (`exec_prompt(..., response_format="json")`) dengan normalisasi defensif.
- Value transfers: `@gl.public.write.payable`, pull payment, external message `emit_transfer`.
- Storage datar (`TreeMap` + `@allow_storage` dataclass), angka berukuran (`u256`, `i32`).
- Transaction context: `sender_address`, `origin_address` (dicatat per kasus), timestamp transaksi.
- Special method `__receive__` untuk menolak transfer liar yang tidak punya pemilik.
- Testing direct mode dengan `mock_web`/`mock_llm` + `run_validator`, dijalankan di CI.

**Layak ditambah, berurutan prioritas**

1. **Events (`gl.chain.Event` → `gen_getLogs`)** — prioritas tertinggi untuk produk, bukan untuk
   logika. Tanpa event, frontend/indexer harus mem-poll `case_count` dan setiap `get_case_*`.
   Ditunda karena sintaks `emit` belum terverifikasi pada SDK yang dipin; verifikasi di Studionet,
   lalu pancarkan event untuk `CaseOpened`, `CaseAccepted`, `EvidenceSubmitted`, `CaseRuled`,
   `CaseSettled`, `Withdrawn`.
2. **`render(url, mode="text")` untuk halaman bukti** — mengurangi noise HTML (token + permukaan
   prompt injection). Trade-off: `render` tidak memberi status code, jadi `get` tetap dipakai untuk
   spesifikasi yang butuh deteksi 4xx/5xx. Bisa diterapkan per-URL.
3. **Bukti visual** — `render(url, mode="screenshot")` + `exec_prompt(..., images=[...])` (maks 2
   gambar) untuk deliverable desain/landing page. Ini kemampuan yang benar-benar khas GenLayer,
   tapi biayanya tinggi: jadikan flag opsional per kasus dan batasi 1 gambar.
4. **Vector store untuk preseden** — cari kasus serupa dan sertakan ringkasannya sebagai konteks,
   supaya keputusan lebih konsisten. Perlu keputusan tentang biaya embedding dan determinisme.
5. **Comparator error `run_nondet`** — saat ini validator memperlakukan leader error sebagai
   `False` (rotasi). Untuk kegagalan web transien, kedua node yang gagal bersamaan sebenarnya boleh
   sepakat gagal. `run_nondet` menerima `compare_user_errors`/`compare_vm_errors`; API-nya belum
   diverifikasi, jadi belum dipakai.
6. **Baca EVM (ERC-8004 registry agen)** — reputasi lintas aplikasi lewat `@gl.evm.contract_interface`
   `.view()`. Fase 2, setelah ada registry yang stabil.

**Sengaja tidak dipakai**

- `strict_eq` untuk verdict: output LLM tidak akan pernah identik.
- Kontrak anak per kasus (`gl.deploy_contract`): biaya deployment tidak sepadan.
- `__handle_undefined_method__`: panggilan tak dikenal sebaiknya gagal, bukan ditangani diam-diam.
- Upgradability: kontrak sengaja immutable. Bila nanti butuh jalur perbaikan, itu keputusan produk
  yang menambah asumsi kepercayaan (siapa yang boleh meng-upgrade) dan harus dibahas terpisah.

## 13. Roadmap

- M1: frontend baca/tulis (genlayer-js), halaman kasus, estimasi fee, tampilan verdict per kriteria.
- M2: Studio-mode test suite + kalibrasi prompt/agreement rate.
- M3: deploy Studionet → Bradbury, ukur biaya dan latensi, dokumentasikan.
- M4: reputasi lintas aplikasi, daftar agen, template rubrik, multi-hakim.


## 14. Catatan kompatibilitas SDK (diverifikasi lewat CI)

Test direct mode dijalankan dengan `genlayer-test==0.29.2` dan `GENVM_VERSION=v0.2.16` (versi
fallback yang dipakai tool itu sendiri). Beberapa perilaku SDK yang berbeda dari asumsi awal, dan
sudah disesuaikan di kontrak:

- `TreeMap` melempar `KeyError` untuk key yang belum ada; tidak ada nilai nol otomatis. Semua
  pembacaan memakai `.get()` + validasi eksplisit.
- Respons web tidak selalu punya `status_code`; kontrak membaca `status_code`/`status`/`code` dan
  body lewat `body`/`content`.
- Nama berkas runner/SDK dan layout `genlayer.types` berbeda antara lini v0.2 dan v0.3. Pin versi
  GenVM di CI; header kontrak memakai `latest` agar tidak bergantung pada hash tertentu.
- `gl.vm.run_nondet` (bukan `run_nondet_unsafe`) dipakai karena test runner direct mode mem-patch
  fungsi itu.



## 15. Read surface untuk frontend

Kontrak menyediakan dua lapis baca: view bertipe untuk komponen kecil, dan satu view JSON untuk
kartu detail kasus (termasuk hasil consensus AI).

**View per field**

- `get_case_count()`, `get_case_status()`, `get_case_verdict()`, `get_case_award_bps()`,
  `get_case_score()`, `get_case_reasons()`.
- `get_case_claim()`, `get_case_criteria()`, `get_case_judge_note()`.
- `get_case_evidence()`, `get_case_rubric()` — konten mentah untuk auditor.
- `get_case_parties()`, `get_case_origin()`, `get_case_deadlines()`, `get_case_timestamps()`
  (`submitted|adjudicated|settled`, Unix detik).
- `get_case_payouts()` — `credit_provider|credit_requester|slashed`.
- `get_credit_of(addr)`, `get_agent_handle/score/stake/active_cases/stats`, `get_escrow_total()`,
  `get_stakes_total()`, `get_credits_total()`.

**`get_case_json(case_id)` — satu panggilan untuk kartu detail**

Mengembalikan string JSON dengan field: `id`, `title`, `status`, `verdict`, `award_bps`, `score`,
`reasons`, `claim`, `criteria`, `reward`, `credit_provider`, `credit_requester`, `slashed`, `judged`,
`judge_note`, `requester`, `provider`, `origin`, `delivery_deadline`, `dispute_deadline`,
`appeal_deadline`, `submitted_ts`, `adjudicated_ts`, `settled_ts`.

`criteria` berbentuk array `{"id": 1, "met": true, "why": "..."}` — inilah bagian yang dibaca
pengguna sebagai "detail consensus AI": kriteria mana yang terpenuhi, mana yang tidak, dan alasan
singkat per kriteria (`why`, maksimal 160 karakter). `reasons` adalah ringkasan keseluruhan
(maksimal 600 karakter). `verdict` + `score` + `award_bps` memberi kesimpulan dan konsekuensi
ekonomi. Rubrik tidak diduplikasi di JSON ini (ambil lewat `get_case_rubric`) agar payload tetap
ringan.

Catatan implementasi: `criteria_report` disimpan sebagai JSON string saat `adjudicate` (maksimal
1200 karakter) dan di-parse kembali oleh view. Semua angka `u256`/`i32` dikonversi ke integer
sebelum diserialisasi agar aman untuk JSON. Jika kasus belum diputus, `criteria` kosong dan
`verdict` kosong.

Untuk daftar kasus, frontend masih memakai `get_case_count()` lalu `get_case_json` per id. Event
(`gl.chain.Event`) tetap rekomendasi berikutnya agar tidak perlu polling; lihat bagian 12.


## 16. Frontend

Vite + React + TypeScript di root repo (bukan subfolder) supaya `index.html` dan `package.json`
terdeteksi saat aplikasi dipublikasikan. Tidak ada backend, tidak ada state server: semua data
berasal dari view kontrak.

- `src/lib/genlayer.ts` — read client (tanpa wallet) dan write client (`window.ethereum`), estimasi
  fee `estimateTransactionFeesForWrite` termasuk `messageAllocations`, lalu
  `waitForTransactionReceipt(ACCEPTED)`.
- `src/lib/format.ts` — label status/verdict, format GEN dan tanggal, `isFinalizable`.
- `src/lib/demo.ts` — tiga kasus contoh agar UI bisa dilihat sebelum deploy.
- `src/components/CaseDetail.tsx` — panel "Putusan AI consensus": verdict, skor, award, alasan,
  dan daftar kriteria dengan `met`/`why`; aksi difilter berdasarkan peran dan status.
- `src/components/NewCaseForm.tsx` — form `open_case` (payable) dengan validasi alamat, URL, dan
  konversi GEN ke wei.

Polling 15 detik menggantikan event. Konsekuensinya: tidak ada riwayat perubahan, dan daftar kasus
dibatasi 50 terbaru (`case_count` lalu `get_case_json` per id). Event tetap backlog utama; begitu
sintaks `gl.chain.Event` diverifikasi di Studionet, polling bisa diganti indexer.
