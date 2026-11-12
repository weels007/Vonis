import type { CaseView } from "./types";

export function shortAddress(address: string): string {
  if (!address) return "—";
  if (address.length <= 12) return address;
  return address.slice(0, 6) + "…" + address.slice(-4);
}

export function sameAddress(a: string, b: string): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function formatDate(unixSeconds: number): string {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatGen(wei: number): string {
  const value = wei / 1e18;
  return value.toLocaleString("id-ID", { maximumFractionDigits: 4 }) + " GEN";
}

export function percent(bps: number): string {
  return (bps / 100).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%";
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Menunggu provider",
  ACCEPTED: "Diterima provider",
  DELIVERED: "Bukti dikirim",
  DISPUTED: "Sengketa",
  RULED: "Diputus",
  SETTLED: "Selesai",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function statusTone(status: string): string {
  switch (status) {
    case "OPEN":
      return "muted";
    case "ACCEPTED":
      return "info";
    case "DELIVERED":
      return "warn";
    case "DISPUTED":
      return "danger";
    case "RULED":
      return "warn";
    case "SETTLED":
      return "success";
    default:
      return "";
  }
}

const VERDICT_LABELS: Record<string, string> = {
  PROVIDER_AT_FAULT: "Provider bersalah",
  REQUESTER_AT_FAULT: "Requester bersalah",
  SHARED: "Sebagian",
  UNVERIFIABLE: "Tidak dapat dinilai",
  ACCEPTED: "Diterima requester",
  CANCELLED: "Dibatalkan",
  JUDGED: "Diputus hakim",
};

export function verdictLabel(verdict: string): string {
  if (!verdict) return "Belum ada putusan";
  return VERDICT_LABELS[verdict] ?? verdict;
}

export function verdictTone(verdict: string): string {
  switch (verdict) {
    case "PROVIDER_AT_FAULT":
      return "danger";
    case "REQUESTER_AT_FAULT":
    case "ACCEPTED":
      return "success";
    case "SHARED":
    case "JUDGED":
      return "warn";
    case "UNVERIFIABLE":
      return "muted";
    default:
      return "";
  }
}

export function actionError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function parseGenToWei(input: string): bigint {
  const cleaned = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,18})?$/.test(cleaned)) {
    throw new Error("Jumlah reward tidak valid.");
  }
  const [whole, fraction = ""] = cleaned.split(".");
  const padded = (fraction + "0".repeat(18)).slice(0, 18);
  return BigInt(whole) * 10n ** 18n + BigInt(padded);
}

export function deadlineToUnix(value: string): number {
  const ts = Math.floor(new Date(value).getTime() / 1000);
  if (!Number.isFinite(ts) || ts <= 0) {
    throw new Error("Tenggat tidak valid.");
  }
  return ts;
}

export function isFinalizable(c: CaseView): boolean {
  return (
    c.status === "RULED" &&
    (c.judged || c.appeal_deadline === 0 || Date.now() / 1000 >= c.appeal_deadline)
  );
}
