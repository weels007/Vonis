import type { TxItem } from "../hooks/useTransactions";
import { explorerTx } from "../lib/genlayer";
import { shortAddress } from "../lib/format";

type Props = {
  item: TxItem;
  onOpen: (hash: string) => void;
  onDismiss: () => void;
};

export default function Toast({ item, onOpen, onDismiss }: Props) {
  const success = item.status === "success";
  return (
    <div className={"toast " + (success ? "ok" : "error")} role="alert" aria-live="polite">
      <div className="toast-body">
        <strong>{success ? item.label + " berhasil" : item.label + " gagal"}</strong>
        <span>{success ? item.method : item.error}</span>
        {item.hash && (
          <div className="toast-links">
            <button className="link" type="button" onClick={() => onOpen(item.hash!)}>
              Detail transaksi
            </button>
            <a className="link" href={explorerTx(item.hash)} target="_blank" rel="noreferrer">
              {shortAddress(item.hash)}
            </a>
          </div>
        )}
      </div>
      <button className="toast-close" type="button" aria-label="Tutup" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
