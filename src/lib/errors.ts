/**
 * Maps raw wallet / contract errors to short, actionable Indonesian messages.
 * The raw message is still kept in the transaction record for debugging.
 */
export function friendlyError(input: unknown): string {
  const raw =
    input instanceof Error
      ? input.message
      : typeof input === "string"
        ? input
        : JSON.stringify(input);

  const text = (raw || "Terjadi kesalahan tak terduga.").trim();
  const lower = text.toLowerCase();

  if (lower.includes("user rejected") || lower.includes("4001") || lower.includes("denied"))
    return "Transaksi dibatalkan di wallet.";
  if (lower.includes("wallet tidak ditemukan") || lower.includes("no wallet"))
    return "Wallet tidak ditemukan. Buka lewat browser dengan MetaMask.";
  if (lower.includes("insufficient funds") || lower.includes("insufficient balance"))
    return "Saldo tidak cukup untuk reward dan biaya transaksi.";
  if (lower.includes("chain") && (lower.includes("mismatch") || lower.includes("wrong")))
    return "Wallet berada di jaringan yang salah. Ganti jaringan lalu coba lagi.";
  if (lower.includes("vite_contract_address"))
    return "Alamat kontrak belum diatur (VITE_CONTRACT_ADDRESS).";
  if (lower.includes("timed out") || lower.includes("timeout"))
    return "Transaksi melewati batas waktu tunggu. Cek hash-nya di explorer sebelum mencoba lagi.";
  if (lower.includes("execution") && lower.includes("error"))
    return "Transaksi diterima tetapi eksekusi kontrak gagal. Buka detail untuk melihat hash.";

  if (lower.includes("case not found")) return "Kasus tidak ditemukan.";
  if (lower.includes("case not open")) return "Kasus tidak lagi menunggu provider.";
  if (lower.includes("case not accepted")) return "Provider belum menerima penugasan.";
  if (lower.includes("case not delivered")) return "Bukti belum dikirim.";
  if (lower.includes("case not disputed")) return "Kasus ini tidak sedang disengketakan.";
  if (lower.includes("case is not ruled")) return "Kasus belum diputus.";
  if (lower.includes("case is not finalizable")) return "Kasus tidak bisa diselesaikan sekarang.";
  if (lower.includes("case is not reviewable")) return "Kasus tidak bisa ditinjau pada status ini.";
  if (lower.includes("appeal window open")) return "Jendela banding masih terbuka.";
  if (lower.includes("judge decision required"))
    return "Kasus perlu keputusan hakim sebelum bisa dibayar.";
  if (lower.includes("only provider")) return "Hanya provider yang bisa melakukan aksi ini.";
  if (lower.includes("only requester")) return "Hanya requester yang bisa melakukan aksi ini.";
  if (lower.includes("only judge")) return "Hanya hakim yang bisa melakukan aksi ini.";
  if (lower.includes("not a party")) return "Wallet ini bukan pihak dalam kasus tersebut.";
  if (lower.includes("not allowed")) return "Wallet ini tidak berhak mengadili kasus tersebut.";
  if (lower.includes("bad evidence")) return "Bukti tidak valid: maksimal 3 URL http/https.";
  if (lower.includes("bad claim")) return "Alasan sengketa tidak valid.";
  if (lower.includes("bad spec url")) return "URL spesifikasi tidak valid.";
  if (lower.includes("bad title")) return "Judul tidak valid.";
  if (lower.includes("bad rubric")) return "Rubrik tidak valid.";
  if (lower.includes("deadline in past")) return "Tenggat sudah lewat.";
  if (lower.includes("delivery deadline passed")) return "Tenggat penyerahan sudah lewat.";
  if (lower.includes("dispute window closed")) return "Jendela sengketa sudah ditutup.";
  if (lower.includes("nothing to withdraw")) return "Tidak ada dana yang bisa diklaim.";
  if (lower.includes("agent not registered")) return "Agen belum terdaftar di kontrak.";
  if (lower.includes("active cases")) return "Stake tidak bisa ditarik selama ada kasus aktif.";
  if (lower.includes("amount exceeds stake")) return "Jumlah melebihi stake.";
  if (lower.includes("nothing to withdraw")) return "Tidak ada dana yang bisa diklaim.";
  if (lower.includes("failed to fetch") || lower.includes("fetch failed"))
    return "Tidak bisa menghubungi jaringan. Periksa koneksi lalu coba lagi.";

  return text.length > 220 ? text.slice(0, 217) + "…" : text;
}

export function rawError(input: unknown): string {
  if (input instanceof Error) return input.message;
  if (typeof input === "string") return input;
  return JSON.stringify(input);
}
