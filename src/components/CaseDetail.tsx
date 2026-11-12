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
  busy: boolean;
  onAction: (functionName: string, args: unknown[], value?: bigint) => void;
};

export default function CaseDetail({ c, account, busy, onAction }: Props) {
  const [evidence, setEvidence] = useState("");
  const [claim, setClaim] = useState("");

  const isRequester = sameAddress(c.requester, account);
  const isProvider = sameAddress(c.provider, account);
  const settled = c.status === "SETTLED";

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
        {!account && <p className="muted">Hubungkan wallet untuk mengirim transaksi.</p>}

        {c.status === "OPEN" && isProvider && (
          <button type="button" disabled={busy} onClick={() => onAction("accept_case", [c.id])}>
            Terima penugasan
          </button>
        )}

        {c.status === "ACCEPTED" && isProvider && (
          <div className="field">
            <label htmlFor="evidence">Bukti (URL, satu per baris, maksimal 3)</label>
            <textarea
              id="evidence"
              rows={3}
              value={evidence}
              placeholder="https://repo.example/hasil"
              onChange={(event) => setEvidence(event.target.value)}
            />
            <button
              type="button"
              disabled={busy || !evidence.trim()}
              onClick={() => onAction("deliver_case", [c.id, evidence.trim()])}
            >
              Kirim bukti
            </button>
          </div>
        )}

        {c.status === "DELIVERED" && isRequester && (
          <button type="button" disabled={busy} onClick={() => onAction("accept_delivery", [c.id])}>
            Terima hasil (reward cair penuh)
          </button>
        )}

        {c.status === "DELIVERED" && (isRequester || isProvider) && (
          <div className="field">
            <label htmlFor="claim">Alasan sengketa</label>
            <textarea
              id="claim"
              rows={2}
              value={claim}
              placeholder="Kriteria apa yang tidak terpenuhi?"
              onChange={(event) => setClaim(event.target.value)}
            />
            <button
              type="button"
              disabled={busy || !claim.trim()}
              onClick={() => onAction("raise_dispute", [c.id, claim.trim()])}
            >
              Buka sengketa
            </button>
          </div>
        )}

        {c.status === "DISPUTED" && (
          <button type="button" disabled={busy} onClick={() => onAction("adjudicate", [c.id])}>
            Minta putusan AI
          </button>
        )}

        {isFinalizable(c) && (
          <button type="button" disabled={busy} onClick={() => onAction("finalize_case", [c.id])}>
            Selesaikan dan bayar
          </button>
        )}

        {(c.status === "OPEN" || c.status === "ACCEPTED") && isRequester && (
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => onAction("cancel_case", [c.id])}
          >
            Batalkan dan kembalikan dana
          </button>
        )}
      </section>
    </div>
  );
}
