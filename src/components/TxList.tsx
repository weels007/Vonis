import type { TxItem } from "../hooks/useTransactions";
import { explorerTx } from "../lib/genlayer";
import { formatDate, shortAddress } from "../lib/format";

type Props = {
  items: TxItem[];
  focusHash?: string | null;
};

function statusChip(status: TxItem["status"]) {
  if (status === "pending") return <span className="chip info">pending…</span>;
  if (status === "success") return <span className="chip success">succeeded</span>;
  return <span className="chip danger">failed</span>;
}

export default function TxList({ items, focusHash }: Props) {
  if (items.length === 0) {
    return <p className="muted">No transactions in this session yet.</p>;
  }

  const ordered = [...items].sort((a, b) => {
    if (focusHash) {
      if (a.hash === focusHash) return -1;
      if (b.hash === focusHash) return 1;
    }
    return b.startedAt - a.startedAt;
  });

  return (
    <ul className="tx-list">
      {ordered.map((item) => (
        <li
          key={item.id}
          className={"tx-item" + (item.hash && item.hash === focusHash ? " focus" : "")}
        >
          <div className="tx-top">
            <strong>{item.label}</strong>
            {statusChip(item.status)}
          </div>
          <div className="tx-meta">
            <code>{item.method}</code>
            <span>{formatDate(item.startedAt / 1000)}</span>
          </div>
          {item.error && <p className="tx-error">{item.error}</p>}
          {item.errorDetail && item.errorDetail !== item.error && (
            <details>
              <summary>Error details</summary>
              <code className="tx-detail">{item.errorDetail}</code>
            </details>
          )}
          {item.hash && (
            <div className="tx-hash">
              <code>{item.hash}</code>
              <a href={explorerTx(item.hash)} target="_blank" rel="noreferrer">
                explorer
              </a>
              <button
                className="link"
                type="button"
                onClick={() => void navigator.clipboard?.writeText(item.hash!)}
              >
                copy
              </button>
            </div>
          )}
          {item.hash && item.status === "success" && (
            <p className="muted smallText">
              Accepted by consensus ({shortAddress(item.hash)}).
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
