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
  pendingKeys: Set<string>;
  onAction: (
    key: string,
    label: string,
    method: string,
    args: unknown[],
    value?: bigint
  ) => void;
};

export default function CaseDetail({ c, account, pendingKeys, onAction }: Props) {
  const [evidence, setEvidence] = useState("");
  const [claim, setClaim] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const isRequester = sameAddress(c.requester, account);
  const isProvider = sameAddress(c.provider, account);
  const settled = c.status === "SETTLED";
  const noWallet = !account;

  const pending = (key: string) => pendingKeys.has(key);

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
          <h2>{c.title || "Tanpa judul"}</h2>
        </div>
        <span className={"chip " + statusTone(c.status)}>{statusLabel(c.status)}</span>
      </div>

      <section className="verdict-card">
        <div className="verdict-top">
          <div>
            <span className="eyebrow">Putusan AI consensus</span>
            <h3 className={"chip " + (c.verdict ? verdictTone(c.verdict) : "muted")}>
              {verdictLabel(c.verdict)}
            </h3>
          </div>
          <div className="score">
            <strong>{c.score}</strong>
            <span>/100</span>
          </div>
        </div>

        <div className="bar">
          <div style={{ width: Math.max(0, Math.min(100, c.score)) + "%" }} />
        </div>

        <p className="muted">
          Award {percent(c.award_bps)} dari {formatGen(c.reward)} · dinilai{" "}
          {formatDate(c.adjudicated_ts)}
        </p>

        {c.reasons ? <p className="reasons">{c.reasons}</p> : null}

        {c.criteria.length > 0 && (
          <ul className="criteria">
            {c.criteria.map((item) => (
              <li key={item.id} className={item.met ? "ok" : "no"}>
                <span className="crit-icon">{item.met ? "✓" : "✕"}</span>
                <div>
                  <strong>Kriteria {item.id}</strong>
                  <em>{item.why || (item.met ? "Terpenuhi." : "Tidak terpenuhi.")}</em>
                </div>
              </li>
            ))}
          </ul>
        )}

        {c.judge_note ? <p className="muted">Catatan hakim: {c.judge_note}</p> : null}
      </section>

      {c.claim ? (
        <section>
          <h3>Klaim sengketa</h3>
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
          <span>Tenggat bukti</span>
          <strong>{formatDate(c.delivery_deadline)}</strong>
        </div>
        <div>
          <span>Bukti dikirim</span>
          <strong>{formatDate(c.submitted_ts)}</strong>
        </div>
        <div>
          <span>Jendela banding</span>
          <strong>{formatDate(c.appeal_deadline)}</strong>
        </div>
        <div>
          <span>Pembayaran</span>
          <strong>
            {settled
              ? formatGen(c.credit_provider) + " ke provider"
              : "belum diselesaikan"}
          </strong>
        </div>
      </section>

      <section className="actions">
        <h3>Aksi</h3>
        {noWallet && <p className="muted">Hubungkan wallet untuk mengirim transaksi.</p>}

        {c.status === "OPEN" && isProvider && (
          <button
            type="button"
            disabled={noWallet || pending(acceptKey)}
            onClick={() =>
              onAction(acceptKey, "Terima penugasan", "accept_case", [c.id])
            }
          >
            {pending(acceptKey) ? "Memproses…" : "Terima penugasan"}
          </button>
        )}

        {c.status === "ACCEPTED" && isProvider && (
          <div className="field">
            <label htmlFor={"evidence-" + c.id}>Bukti (URL, satu per baris, maksimal 3)</label>
            <textarea
              id={"evidence-" + c.id}
              rows={3}
              value={evidence}
              placeholder="https://repo.example/hasil"
              onChange={(event) => setEvidence(event.target.value)}
            />
            <button
              type="button"
              disabled={noWallet || pending(deliverKey) || !evidence.trim()}
              onClick={() =>
                onAction(deliverKey, "Kirim bukti", "deliver_case", [
                  c.id,
                  evidence.trim(),
                ])
              }
            >
              {pending(deliverKey) ? "Mengirim…" : "Kirim bukti"}
            </button>
          </div>
        )}

        {c.status === "DELIVERED" && isRequester && (
          <button
            type="button"
            disabled={noWallet || pending(acceptDeliveryKey)}
            onClick={() =>
              onAction(acceptDeliveryKey, "Terima hasil", "accept_delivery", [c.id])
            }
          >
            {pending(acceptDeliveryKey)
              ? "Memproses…"
              : "Terima hasil (reward cair penuh)"}
          </button>
        )}

        {c.status === "DELIVERED" && (isRequester || isProvider) && (
          <div className="field">
            <label htmlFor={"claim-" + c.id}>Alasan sengketa</label>
            <textarea
              id={"claim-" + c.id}
              rows={2}
              value={claim}
              placeholder="Kriteria apa yang tidak terpenuhi?"
              onChange={(event) => setClaim(event.target.value)}
            />
            <button
              type="button"
              disabled={noWallet || pending(disputeKey) || !claim.trim()}
              onClick={() =>
                onAction(disputeKey, "Buka sengketa", "raise_dispute", [
                  c.id,
                  claim.trim(),
                ])
              }
            >
              {pending(disputeKey) ? "Mengirim…" : "Buka sengketa"}
            </button>
          </div>
        )}

        {c.status === "DISPUTED" && (
          <button
            type="button"
            disabled={noWallet || pending(adjudicateKey)}
            onClick={() =>
              onAction(adjudicateKey, "Minta putusan AI", "adjudicate", [c.id])
            }
          >
            {pending(adjudicateKey) ? "Mengadili…" : "Minta putusan AI"}
          </button>
        )}

        {isFinalizable(c) && (
          <button
            type="button"
            disabled={noWallet || pending(finalizeKey)}
            onClick={() =>
              onAction(finalizeKey, "Selesaikan kasus", "finalize_case", [c.id])
            }
          >
            {pending(finalizeKey) ? "Menyelesaikan…" : "Selesaikan dan bayar"}
          </button>
        )}

        {(c.status === "OPEN" || c.status === "ACCEPTED") && isRequester && (
          <>
            {!confirmCancel ? (
              <button
                type="button"
                className="ghost"
                disabled={noWallet || pending(cancelKey)}
                onClick={() => setConfirmCancel(true)}
              >
                Batalkan dan kembalikan dana
              </button>
            ) : (
              <div className="confirm">
                <p>Yakin membatalkan? Reward dikembalikan ke requester.</p>
                <div className="row">
                  <button type="button" className="ghost" onClick={() => setConfirmCancel(false)}>
                    Tidak
                  </button>
                  <button
                    type="button"
                    disabled={pending(cancelKey)}
                    onClick={() => {
                      setConfirmCancel(false);
                      onAction(cancelKey, "Batalkan kasus", "cancel_case", [c.id]);
                    }}
                  >
                    {pending(cancelKey) ? "Membatalkan…" : "Ya, batalkan"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
