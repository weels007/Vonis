import CaseList from "../components/CaseList";
import { navigate } from "../lib/router";
import type { CaseView } from "../lib/types";
import { formatGen } from "../lib/format";

type Props = { cases: CaseView[] };

export default function Cases({ cases }: Props) {
  const open = cases.filter((item) => item.status === "OPEN").length;
  const disputed = cases.filter((item) => item.status === "DISPUTED").length;
  const settled = cases.filter((item) => item.status === "SETTLED").length;
  const escrowed = cases
    .filter((item) => item.status !== "SETTLED")
    .reduce((total, item) => total + item.reward, 0);

  return (
    <div className="page-body">
      <div className="page-head">
        <div>
          <span className="eyebrow">Case explorer</span>
          <h1>Cases</h1>
          <p>Every dispute this court has seen, newest first.</p>
        </div>
        <a className="btn primary" href="#/new">
          Open a case
        </a>
      </div>

      <div className="stat-row">
        <div>
          <span>Open</span>
          <strong>{open}</strong>
        </div>
        <div>
          <span>In dispute</span>
          <strong>{disputed}</strong>
        </div>
        <div>
          <span>Settled</span>
          <strong>{settled}</strong>
        </div>
        <div>
          <span>Still escrowed</span>
          <strong>{formatGen(escrowed)}</strong>
        </div>
      </div>

      <section className="panel">
        <CaseList
          cases={cases}
          selectedId={null}
          onSelect={(id) => navigate({ name: "case", id })}
        />
      </section>
    </div>
  );
}
