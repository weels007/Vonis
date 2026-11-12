/**
 * Maps raw wallet / contract errors to short, actionable English messages.
 * The raw message is still kept in the transaction record for debugging.
 */
export function friendlyError(input: unknown): string {
  const raw =
    input instanceof Error
      ? input.message
      : typeof input === "string"
        ? input
        : JSON.stringify(input);

  const text = (raw || "Something went wrong.").trim();
  const lower = text.toLowerCase();

  if (lower.includes("user rejected") || lower.includes("4001") || lower.includes("denied"))
    return "Transaction rejected in the wallet.";
  if (lower.includes("wallet tidak ditemukan") || lower.includes("no wallet"))
    return "No wallet found. Open this page in a browser with MetaMask.";
  if (lower.includes("insufficient funds") || lower.includes("insufficient balance"))
    return "Insufficient balance for the reward and network fees.";
  if (lower.includes("chain") && (lower.includes("mismatch") || lower.includes("wrong")))
    return "The wallet is on the wrong network. Switch networks and try again.";
  if (lower.includes("contract address is not configured"))
    return "The contract address is missing from src/lib/genlayer.ts.";
  if (lower.includes("timed out") || lower.includes("timeout"))
    return "The transaction took too long. Check its hash in the explorer before retrying.";
  if (lower.includes("execution") && lower.includes("error"))
    return "The transaction was accepted but contract execution failed. Open the transaction details.";

  if (lower.includes("case not found")) return "Case not found.";
  if (lower.includes("case not open")) return "This case is no longer awaiting the provider.";
  if (lower.includes("case not accepted")) return "The provider has not accepted this case.";
  if (lower.includes("case not delivered")) return "No evidence has been submitted yet.";
  if (lower.includes("case not disputed")) return "This case is not in dispute.";
  if (lower.includes("case is not ruled")) return "This case has not been ruled yet.";
  if (lower.includes("case is not finalizable")) return "This case cannot be settled yet.";
  if (lower.includes("case is not reviewable"))
    return "This case cannot be reviewed in its current state.";
  if (lower.includes("appeal window open")) return "The appeal window is still open.";
  if (lower.includes("judge decision required"))
    return "A judge decision is required before this case can be paid out.";
  if (lower.includes("only provider")) return "Only the provider can do this.";
  if (lower.includes("only requester")) return "Only the requester can do this.";
  if (lower.includes("only judge")) return "Only the judge can do this.";
  if (lower.includes("not a party")) return "This wallet is not a party to that case.";
  if (lower.includes("not allowed"))
    return "This wallet is not allowed to adjudicate that case.";
  if (lower.includes("bad evidence")) return "Invalid evidence: up to 3 http/https URLs.";
  if (lower.includes("bad claim")) return "Enter a valid dispute reason.";
  if (lower.includes("bad spec url")) return "Enter a valid specification URL.";
  if (lower.includes("bad title")) return "Enter a valid title.";
  if (lower.includes("bad rubric")) return "Enter a valid rubric.";
  if (lower.includes("deadline in past")) return "The deadline is in the past.";
  if (lower.includes("delivery deadline passed")) return "The delivery deadline has passed.";
  if (lower.includes("dispute window closed")) return "The dispute window has closed.";
  if (lower.includes("nothing to withdraw")) return "There are no funds to claim.";
  if (lower.includes("agent not registered")) return "That agent is not registered.";
  if (lower.includes("active cases")) return "Stake cannot be withdrawn while cases are active.";
  if (lower.includes("amount exceeds stake")) return "Amount exceeds the staked balance.";
  if (lower.includes("failed to fetch") || lower.includes("fetch failed"))
    return "Cannot reach the network. Check your connection and try again.";

  return text.length > 220 ? text.slice(0, 217) + "…" : text;
}

export function rawError(input: unknown): string {
  if (input instanceof Error) return input.message;
  if (typeof input === "string") return input;
  return JSON.stringify(input);
}
