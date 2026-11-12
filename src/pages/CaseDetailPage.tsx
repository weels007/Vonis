import CaseDetail from "../components/CaseDetail";
import type { CaseView } from "../lib/types";

type Props = {
  caseId: string;
  cases: CaseView[];
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

export default function CaseDetailPage({
  caseId,
  cases,
  account,
  judge,
  pendingKeys,
  onAction,
}: Props) {
  const item = cases.find((entry) => entry.id === caseId);

  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <a className="back-link" href="#/cases">
            ← All cases
          </a>
          <h1 className="visually-hidden">{item?.title || "Case"}</h1>
          <span className="eyebrow">Case</span>
        </div>
      </div>

      {item ? (
        <section className="panel">
          <CaseDetail
            c={item}
            account={account}
            judge={judge}
            pendingKeys={pendingKeys}
            onAction={onAction}
          />
        </section>
      ) : (
        <section className="panel">
          <p className="muted">
            This case is not loaded yet. If it was just created, wait for the next refresh and try
            again.
          </p>
        </section>
      )}
    </div>
  );
}
