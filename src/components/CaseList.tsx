import type { CaseView } from "../lib/types";
import {
  formatGen,
  shortAddress,
  statusLabel,
  statusTone,
  verdictLabel,
  verdictTone,
} from "../lib/format";

type Props = {
  cases: CaseView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export default function CaseList({ cases, selectedId, onSelect }: Props) {
  if (cases.length === 0) {
    return <p className="muted">No cases in this contract yet.</p>;
  }

  return (
    <ul className="case-list">
      {cases.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className={"case-item" + (item.id === selectedId ? " active" : "")}
            onClick={() => onSelect(item.id)}
          >
            <div className="case-top">
              <strong>{item.title || item.id}</strong>
              <span className={"chip " + statusTone(item.status)}>
                {statusLabel(item.status)}
              </span>
            </div>
            <div className="case-meta">
              <span>{item.id}</span>
              <span>{formatGen(item.reward)}</span>
              <span>{shortAddress(item.provider)}</span>
            </div>
            {item.verdict && (
              <span className={"chip small " + verdictTone(item.verdict)}>
                {verdictLabel(item.verdict)}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
