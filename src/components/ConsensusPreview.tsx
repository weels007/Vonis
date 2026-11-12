import type { CaseView } from "../lib/types";
import { formatGen, percent, verdictLabel, verdictTone } from "../lib/format";

type Props = { c: CaseView | null };

export default function ConsensusPreview({ c }: Props) {
  if (!c) {
    return (
      <div className="verdict-card consensus-preview empty-verdict">
        <div className="verdict-top">
          <div>
            <span className="eyebrow">AI consensus verdict</span>
            <h3 className="chip muted">No verdict on chain yet</h3>
          </div>
        </div>
        <p className="muted">
          The first settled case appears here with its score, award and per-criterion reasons.
        </p>
      </div>
    );
  }

  const color =
    c.score >= 70 ? "var(--ok)" : c.score >= 40 ? "var(--warn)" : "var(--danger)";

  return (
    <div className="verdict-card consensus-preview">
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
        <div style={{ width: Math.max(0, Math.min(100, c.score)) + "%", background: color }} />
      </div>

      <p className="muted">
        {percent(c.award_bps)} of {formatGen(c.reward)} awarded to the provider
      </p>

      <ul className="criteria">
        {c.criteria.map((item) => (
          <li key={item.id} className={item.met ? "ok" : "no"}>
            <span className="crit-icon">{item.met ? "✓" : "✕"}</span>
            <div>
              <strong>Criterion {item.id}</strong>
              <em>{item.why}</em>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
