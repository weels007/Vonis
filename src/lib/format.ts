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
  EXPIRED: "Expired without a delivery",
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
    case "EXPIRED":
    case "CANCELLED":
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
  // `finalize_case` refuses an UNVERIFIABLE case the judge never ruled, so the
  // settle button must not appear for it: the judge form and the rescue path
  // are the only routes out of that state.
  if (c.verdict === "UNVERIFIABLE" && !c.judged) return false;
  return (
    c.status === "RULED" &&
    (c.judged || c.appeal_deadline === 0 || Date.now() / 1000 >= c.appeal_deadline)
  );
}

// Mirrors RESCUE_WINDOW in the contract: either party may refund an
// UNVERIFIABLE case the judge never ruled once this window has passed.
const RESCUE_WINDOW = 14 * 24 * 3600;

function nowSeconds(): number {
  return Date.now() / 1000;
}

export function rescueUnlocksAt(c: CaseView): number {
  return c.adjudicated_ts + RESCUE_WINDOW;
}

export function isExpired(c: CaseView): boolean {
  return (
    (c.status === "OPEN" || c.status === "ACCEPTED") &&
    c.delivery_deadline > 0 &&
    nowSeconds() > c.delivery_deadline
  );
}

export function isAwaitingJudge(c: CaseView): boolean {
  return c.status === "RULED" && c.verdict === "UNVERIFIABLE" && !c.judged;
}

export function canRescueCase(c: CaseView): boolean {
  return isAwaitingJudge(c) && nowSeconds() >= rescueUnlocksAt(c);
}

// The judge may rule a case that already has a verdict: that is how an
// UNVERIFIABLE case gets settled, and how a verdict the judge disagrees with is
// overridden. A case with no verdict stays on the adjudicate path, so the client
// never produces a settled case with nothing to show in the verdict card.
export function isReviewable(c: CaseView): boolean {
  return c.status === "RULED";
}

