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
  return new Date(unixSeconds * 1000).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatGen(wei: number): string {
  const value = wei / 1e18;
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 }) + " GEN";
}

export function percent(bps: number): string {
  return (bps / 100).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "%";
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Awaiting provider",
  ACCEPTED: "Accepted by provider",
  DELIVERED: "Evidence submitted",
  DISPUTED: "In dispute",
  RULED: "Ruled",
  SETTLED: "Settled",
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
  PROVIDER_AT_FAULT: "Provider at fault",
  REQUESTER_AT_FAULT: "Requester at fault",
  SHARED: "Shared fault",
  UNVERIFIABLE: "Unverifiable",
  ACCEPTED: "Accepted by requester",
  CANCELLED: "Cancelled",
  JUDGED: "Ruled by judge",
};

export function verdictLabel(verdict: string): string {
  if (!verdict) return "No verdict yet";
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

export function parseGenToWei(input: string): bigint {
  const cleaned = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{0,18})?$/.test(cleaned)) {
    throw new Error("Enter a valid reward amount.");
  }
  const [whole, fraction = ""] = cleaned.split(".");
  const padded = (fraction + "0".repeat(18)).slice(0, 18);
  return BigInt(whole) * 10n ** 18n + BigInt(padded);
}

export function deadlineToUnix(value: string): number {
  const ts = Math.floor(new Date(value).getTime() / 1000);
  if (!Number.isFinite(ts) || ts <= 0) {
    throw new Error("Enter a valid deadline.");
  }
  return ts;
}

export function isFinalizable(c: CaseView): boolean {
  return (
    c.status === "RULED" &&
    (c.judged || c.appeal_deadline === 0 || Date.now() / 1000 >= c.appeal_deadline)
  );
}
