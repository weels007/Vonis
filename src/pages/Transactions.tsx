import TxList from "../components/TxList";
import type { TxItem } from "../hooks/useTransactions";

type Props = {
  items: TxItem[];
  onClear: () => void;
};

export default function Transactions({ items, onClear }: Props) {
  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <span className="eyebrow">This session</span>
          <h1>Transactions</h1>
          <p>
            Every write sent from this browser, with its hash, status and error details. History is
            kept locally — it is not on-chain state.
          </p>
        </div>
        {items.length > 0 && (
          <button className="ghost" type="button" onClick={onClear}>
            Clear history
          </button>
        )}
      </div>

      <section className="panel">
        <TxList items={items} />
      </section>
    </div>
  );
}
