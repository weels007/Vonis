import type { TxItem } from "../hooks/useTransactions";
import { explorerTx } from "../lib/genlayer";
import { formatDate, shortAddress } from "../lib/format";

type Props = {
  open: boolean;
  items: TxItem[];
  focusHash: string | null;
  onClose: () => void;
  onClear: () => void;
};

function statusChip(status: TxItem["status"]) {
  if (status === "pending") return <span className="chip info">diproses…</span>;
  if (status === "success") return <span className="chip success">berhasil</span>;
  return <span className="chip danger">gagal</span>;
}

export default function TxPanel({ open, items, focusHash, onClose, onClear }: Props) {
  if (!open) return null;

  const ordered = [...items].sort((a, b) => {
    if (focusHash) {
      if (a.hash === focusHash) return -1;
      if (b.hash === focusHash) return 1;
    }
    return b.startedAt - a.startedAt;
  });

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Riwayat transaksi"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">Sesi ini</span>
            <h2>Transaksi</h2>
          </div>
          <div className="modal-actions">
            {items.length > 0 && (
              <button className="ghost" type="button" onClick={onClear}>
                Bersihkan
              </button>
            )}
            <button className="ghost" type="button" onClick={onClose} aria-label="Tutup">
              ×
            </button>
          </div>
        </div>

        {ordered.length === 0 ? (
          <p className="muted">Belum ada transaksi di sesi ini.</p>
        ) : (
          <ul className="tx-list">
            {ordered.map((item) => (
              <li
                key={item.id}
                className={
                  "tx-item" + (item.hash && item.hash === focusHash ? " focus" : "")
                }
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
                    <summary>Detail error</summary>
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
                      salin
                    </button>
                  </div>
                )}
                {item.hash && item.status === "success" && (
                  <p className="muted smallText">
                    Eksekusi {shortAddress(item.hash)} diterima konsensus.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
