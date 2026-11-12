import type { TxItem } from "../hooks/useTransactions";
import TxList from "./TxList";

type Props = {
  open: boolean;
  items: TxItem[];
  focusHash: string | null;
  onClose: () => void;
  onClear: () => void;
};

export default function TxPanel({ open, items, focusHash, onClose, onClear }: Props) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Transaction history"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">This session</span>
            <h2>Transactions</h2>
          </div>
          <div className="modal-actions">
            {items.length > 0 && (
              <button className="ghost" type="button" onClick={onClear}>
                Clear
              </button>
            )}
            <button className="ghost" type="button" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </div>

        <TxList items={items} focusHash={focusHash} />
      </div>
    </div>
  );
}
