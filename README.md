# Vonis

Pengadilan sengketa on-chain untuk agen otonom, dibangun sebagai Intelligent Contract GenLayer.

Dua agen menyepakati pekerjaan (requester dan provider). Provider mengirim bukti hasil kerja berupa
URL. Jika requester menolak, sengketa dibuka dan **verdict** dihasilkan oleh LLM yang diminta menilai
terhadap kriteria penerimaan, lalu **diverifikasi ulang secara independen oleh validator GenLayer**.
Yang memindahkan uang selalu kode deterministik, bukan teks LLM.

Status: fondasi kontrak + test suite (Milestone 0–1). Belum di-deploy.

## Kenapa GenLayer

Sengketa "apakah hasil kerja ini memenuhi kesepakatan" tidak bisa direduksi menjadi data on-chain.
Smart contract biasa hanya bisa mengeksekusi aturan; di sini keputusan butuh membaca bahasa dan bukti
publik. GenLayer memberi tiga hal yang tidak dimiliki oracle atau backend terpusat:

- kontrak bisa mengambil bukti web sendiri (`gl.nondet.web.get`) tanpa perantara;
- penilaian kualitatif dilakukan LLM di dalam nondeterministic block;
- hasilnya disahkan lewat konsensus validator (Equivalence Principle) dan bisa dibanding.

## Alur kasus

- `open_case` (payable) — requester mengunci reward, menetapkan provider, URL spesifikasi, rubrik
  penerimaan (satu kriteria per baris), dan batas waktu penyerahan.
- `accept_case` — provider menerima penugasan.
- `deliver_case` — provider mengirim bukti (maksimal 3 URL, dipisah newline).
- `accept_delivery` — jalur cepat: requester menerima, reward cair penuh tanpa biaya AI.
- `raise_dispute` — requester (dalam jendela 3 hari) atau provider (agar tidak menggantung).
- `adjudicate` — nondeterministic block: ambil spesifikasi + bukti, minta verdict terstruktur,
  validator menjalankan ulang dan membandingkan field keputusan.
- `finalize_case` — setelah jendela banding 24 jam, dana dikreditkan sesuai `award_bps`.
- `judge_rule` — hakim (alamat deployer) dapat memutus manual, termasuk untuk kasus
  `UNVERIFIABLE` atau indikasi prompt injection.
- `withdraw` — pihak yang berhak menarik kreditnya sendiri (pull payment).

Status: `OPEN → ACCEPTED → DELIVERED → DISPUTED → RULED → SETTLED`, ditambah `CANCELLED` lewat
`cancel_case` sebelum penyerahan.

## Struktur repo

- `contracts/vonis.py` — kontrak Intelligent Contract (storage, state machine, adjudikasi, settlement).
- `tests/` — pytest direct mode: registry, state machine, adjudikasi, konsensus validator.
- `docs/ARSITEKTUR.md` — desain, invariant, strategi konsensus, keamanan, deploy, roadmap.
- `.github/workflows/ci.yml` — compile kontrak + jalankan test.

## Menjalankan test

Butuh Python 3.12+.

```bash
python -m pip install "genlayer-test==0.29.2" "pytest>=8"
pytest -q
```

Alternatif: `python -m pip install -e ".[dev]"` (ekstra dev di `pyproject.toml`).

Direct mode berjalan in-memory (milidetik), tanpa Docker maupun jaringan. Panggilan web dan LLM
di-mock lewat `direct_vm.mock_web()` dan `direct_vm.mock_llm()`. Pada run pertama, `genlayer-test`
mengunduh SDK yang sesuai dengan header `Depends` kontrak (butuh koneksi internet).

`withdraw` sengaja tidak diuji di direct mode karena mode itu tidak mendukung pesan keluar;
pembayaran diuji di Studio mode nanti. Yang diuji di sini adalah ledger kredit dan seluruh
aritmetika settlement.

## Deploy (ringkas)

```bash
genlayer network set studionet
genlayer deploy --contract contracts/vonis.py
```

Alamat deployer menjadi hakim. Catat alamat kontrak di `.env` lalu di `docs/ARSITEKTUR.md`.
Untuk Bradbury, siapkan wallet + faucet, dan estimasi fee transaksi tulis termasuk alokasi pesan
untuk `withdraw` (lihat dokumentasi fee v0.6 GenLayer).

## Properti keamanan yang dijaga test

- Reward tidak bisa ditarik dua kali: status `SETTLED` menutup semua jalur pembayaran.
- Verdict `UNVERIFIABLE` dan flag `injection_suspected` tidak pernah auto-settle; harus lewat hakim.
- `withdraw` hanya mengirim kredit milik pemanggil, dan menolkan kredit sebelum emit (anti re-entrancy).
- Validator menolak leader yang verdict-nya berbeda, skornya menyimpang > 15, award-nya menyimpang
  > 1500 bps, kriteria yang berbeda, atau flag injeksi yang berbeda.
- Bukti dibatasi 3 URL, panjang maksimum, dan hanya http/https.

## Yang belum ada

- Frontend dApp (Vue/React + genlayer-js), indexer daftar kasus.
- Integrasi `emit_transfer` diuji hanya di Studio mode (direct mode tidak mendukung pesan keluar).
- Multi-hakim/DAO, banding protokol di UI, reputasi lintas aplikasi.
