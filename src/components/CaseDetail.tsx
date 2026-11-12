import { useState } from "react";
import type { CaseView } from "../lib/types";
import {
  formatDate,
  formatGen,
  isFinalizable,
  percent,
  sameAddress,
  shortAddress,
  statusLabel,
  statusTone,
  verdictLabel,
  verdictTone,
} from "../lib/format";

type Props = {
  c: CaseView;
  account: string;
  judge: string;
  pendingKeys: Set<string>;
  onAction: (
    key: string,
    label: string,
    method: string,
    args: unknown[],
    value?: bigint
  ) => void;
};

export default function CaseDetail({ c, account, judge, pendingKeys, onAction }: Props) {
  const [evidence, setEvidence] = useState("");
  const [claim, setClaim] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const isRequester = sameAddress(c.requester, account);
  const isProvider = sameAddress(c.provider, account);
  const isJudge = sameAddress(judge, account);
  const settled = c.status === "SETTLED";
  const noWallet = !account;

  const pending = (key: string) => pendingKeys.has(key);

  const canAccept = c.status === "OPEN" && isProvider;
  const canDeliver = c.status === "ACCEPTED" && isProvider;
  const canAcceptDelivery = c.status === "DELIVERED" && isRequester;
  const canDispute = c.status === "DELIVERED" && (isRequester || isProvider);
  const canAdjudicate = c.status === "DISPUTED" && (isRequester || isProvider || isJudge);
  const canFinalize = isFinalizable(c);
  const canCancel = (c.status === "OPEN" || c.status === "ACCEPTED") && isRequester;
  const hasActions =
    canAccept ||
    canDeliver ||
    canAcceptDelivery ||
    canDispute ||
    canAdjudicate ||
    canFinalize ||
    canCancel;

  const hasVerdict = !!c.verdict;
  const scoreColor =
    c.score >= 70 ? "var(--ok)" : c.score >= 40 ? "var(--warn)" : "var(--danger)";

  const acceptKey = "accept:" + c.id;
  const deliverKey = "deliver:" + c.id;
  const acceptDeliveryKey = "accept-delivery:" + c.id;
  const disputeKey = "dispute:" + c.id;
  const adjudicateKey = "adjudicate:" + c.id;
  const finalizeKey = "finalize:" + c.id;
  const cancelKey = "cancel:" + c.id;

  return (
    <div className="detail">
      <div className="detail-head">
        <div>
          <span className="eyebrow">{c.id}</span>
          <h2>{c.title || "Untitled case"}</h2>
        </div>
        <span className={"chip " + statusTone(c.status)}>{statusLabel(c.status)}</span>
      </div>

      <section className={"verdict-card" + (hasVerdict ? "" : " empty-verdict")}>
        {hasVerdict ? (
          <>
            <div className="verdict-top">
              <div>
                <span className="eyebrow">AI consensus verdict</span>
                <h3 className={"chip " + verdictTone(c.verdict)}>{verdictLabel(c.verdict)}</h3>
              </div>
              <div className="score">
                <strong>{c.score}</strong>
                <span>/100</span>
              </div>
            </div>

            <div className="bar">
              <div
                style={{
                  width: Math.max(0, Math.min(100, c.score)) + "%",
                  background: scoreColor,
                }}
              />
            </div>

            <p className="muted">
              Award {percent(c.award_bps)} of {formatGen(c.reward)} · judged{" "}
              {formatDate(c.adjudicated_ts)}
            </p>

            {c.reasons ? <p className="reasons">{c.reasons}</p> : null}

            {c.criteria.length > 0 && (
              <ul className="criteria">
                {c.criteria.map((item) => (
                  <li key={item.id} className={item.met ? "ok" : "no"}>
                    <span className="crit-icon">{item.met ? "✓" : "✕"}</span>
                    <div>
                      <strong>Criterion {item.id}</strong>
                      <em>{item.why || (item.met ? "Met." : "Not met.")}</em>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {c.judge_note ? <p className="muted">Judge note: {c.judge_note}</p> : null}
          </>
        ) : (
          <p className="muted">
            No verdict yet. A verdict appears once the dispute is adjudicated.
          </p>
        )}
      </section>

      {c.claim ? (
        <section>
          <h3>Dispute claim</h3>
          <p>{c.claim}</p>
        </section>
      ) : null}

      <section className="facts">
        <div>
          <span>Requester</span>
          <strong>{shortAddress(c.requester)}</strong>
        </div>
        <div>
          <span>Provider</span>
          <strong>{shortAddress(c.provider)}</strong>
        </div>
        <div>
          <span>Evidence deadline</span>
          <strong>{formatDate(c.delivery_deadline)}</strong>
        </div>
        <div>
          <span>Evidence submitted</span>
          <strong>{formatDate(c.submitted_ts)}</strong>
        </div>
        <div>
          <span>Appeal window</span>
          <strong>{formatDate(c.appeal_deadline)}</strong>
        </div>
        <div>
          <span>Payment</span>
          <strong>
            {settled
              ? formatGen(c.credit_provider) + " to provider"
              : "not settled yet"}
          </strong>
        </div>
      </section>

      {c.status === "DISPUTED" && !canAdjudicate && (
        <p className="muted">
          Only the requester, the provider or the judge can request the AI verdict for this case.
        </p>
      )}

      {hasActions && (
        <section className="actions">
          <h3>Actions</h3>
          {noWallet && <p className="muted">Connect a wallet to send transactions.</p>}

          {canAccept && (
            <button
              type="button"
              disabled={noWallet || pending(acceptKey)}
              onClick={() =>
                onAction(acceptKey, "Accept assignment", "accept_case", [c.id])
              }
            >
              {pending(acceptKey) ? "Working…" : "Accept assignment"}
            </button>
          )}

          {canDeliver && (
            <div className="field">
              <label htmlFor={"evidence-" + c.id}>
                Evidence (URLs, one per line, max 3)
              </label>
              <textarea
                id={"evidence-" + c.id}
                rows={3}
                maxLength={900}
                value={evidence}
                placeholder="https://repo.example/work"
                onChange={(event) => setEvidence(event.target.value)}
              />
              <button
                type="button"
                disabled={noWallet || pending(deliverKey) || !evidence.trim()}
                onClick={() =>
                  onAction(deliverKey, "Submit evidence", "deliver_case", [
                    c.id,
                    evidence.trim(),
                  ])
                }
              >
                {pending(deliverKey) ? "Submitting…" : "Submit evidence"}
              </button>
            </div>
          )}

          {canAcceptDelivery && (
            <button
              type="button"
              disabled={noWallet || pending(acceptDeliveryKey)}
              onClick={() =>
                onAction(acceptDeliveryKey, "Accept deliverable", "accept_delivery", [c.id])
              }
            >
              {pending(acceptDeliveryKey)
                ? "Working…"
                : "Accept deliverable (release full reward)"}
            </button>
          )}

          {canDispute && (
            <div className="field">
              <label htmlFor={"claim-" + c.id}>Dispute reason</label>
              <textarea
                id={"claim-" + c.id}
                rows={2}
                value={claim}
                placeholder="Which criteria were not met?"
                onChange={(event) => setClaim(event.target.value)}
              />
              <button
                type="button"
                disabled={noWallet || pending(disputeKey) || !claim.trim()}
                onClick={() =>
                  onAction(disputeKey, "Raise dispute", "raise_dispute", [
                    c.id,
                    claim.trim(),
                  ])
                }
              >
                {pending(disputeKey) ? "Submitting…" : "Raise dispute"}
              </button>
            </div>
          )}

          {canAdjudicate && (
            <button
              type="button"
              disabled={noWallet || pending(adjudicateKey)}
              onClick={() =>
                onAction(adjudicateKey, "Request AI verdict", "adjudicate", [c.id])
              }
            >
              {pending(adjudicateKey) ? "Adjudicating…" : "Request AI verdict"}
            </button>
          )}

          {canFinalize && (
            <button
              type="button"
              disabled={noWallet || pending(finalizeKey)}
              onClick={() =>
                onAction(finalizeKey, "Settle case", "finalize_case", [c.id])
              }
            >
              {pending(finalizeKey) ? "Settling…" : "Settle and pay out"}
            </button>
          )}

          {canCancel && (
            <>
              {!confirmCancel ? (
                <button
                  type="button"
                  className="ghost"
                  disabled={noWallet || pending(cancelKey)}
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancel and refund
                </button>
              ) : (
                <div className="confirm">
                  <p>Cancel this case? The reward is refunded to the requester.</p>
                  <div className="row">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setConfirmCancel(false)}
                    >
                      No
                    </button>
                    <button
                      type="button"
                      disabled={pending(cancelKey)}
                      onClick={() => {
                        setConfirmCancel(false);
                        onAction(cancelKey, "Cancel case", "cancel_case", [c.id]);
                      }}
                    >
                      {pending(cancelKey) ? "Cancelling…" : "Yes, cancel"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
