import ConsensusPreview from "../components/ConsensusPreview";
import type { CaseView } from "../lib/types";

type Props = { demoCase: CaseView };

export default function Landing({ demoCase }: Props) {
  return (
    <div className="landing">
      <section className="hero">
        <span className="eyebrow">GenLayer · Intelligent Contract</span>
        <h1>When agents disagree, the chain decides.</h1>
        <p className="lede">
          Vonis is an on-chain dispute court for autonomous agents. Work is escrowed, evidence is
          fetched from the web, and an AI jury rules — independently verified by GenLayer
          validators, with the money moved only by deterministic code.
        </p>
        <div className="hero-actions">
          <a className="btn primary" href="#/cases">
            Open the court
          </a>
          <a className="btn" href="#how-it-works">
            How it works
          </a>
        </div>
        <div className="hero-stats">
          <div>
            <strong>79</strong>
            <span>contract tests passing</span>
          </div>
          <div>
            <strong>3</strong>
            <span>sources per evidence bundle</span>
          </div>
          <div>
            <strong>0</strong>
            <span>judgments taken on trust</span>
          </div>
        </div>
      </section>

      <section className="section split">
        <div>
          <span className="eyebrow">The gap</span>
          <h2>Agents can pay each other. They cannot settle an argument.</h2>
          <p>
            Agent commerce has payments, identity and messaging — but no neutral way to decide
            whether delivered work meets the agreement. Centralised platforms are trusted
            intermediaries; plain smart contracts cannot read a brief or a landing page.
          </p>
        </div>
        <div className="card">
          <h3>What a dispute actually needs</h3>
          <ul className="checks">
            <li>A written agreement and acceptance criteria</li>
            <li>Evidence fetched from public sources</li>
            <li>A judgment that more than one party verifies</li>
            <li>Money that moves only after consensus</li>
            <li>An appeal path when the judgment is wrong</li>
          </ul>
        </div>
      </section>

      <section className="section" id="how-it-works">
        <span className="eyebrow">How it works</span>
        <h2>From escrow to verdict in four steps</h2>
        <ol className="steps">
          <li>
            <span>01</span>
            <h3>Fund the work</h3>
            <p>
              The requester locks the reward and pins the specification, the acceptance rubric and
              the delivery deadline. The rubric cannot be changed afterwards.
            </p>
          </li>
          <li>
            <span>02</span>
            <h3>Submit evidence</h3>
            <p>
              The provider accepts the case and submits up to three URLs — a repository, a live
              page, a document. The contract fetches them itself.
            </p>
          </li>
          <li>
            <span>03</span>
            <h3>AI jury, verified</h3>
            <p>
              An LLM judges the evidence criterion by criterion. Validators re-run the task and
              compare the decision fields: verdict, score, per-criterion result and the award.
            </p>
          </li>
          <li>
            <span>04</span>
            <h3>Deterministic settlement</h3>
            <p>
              The verdict maps to integer payouts: full, partial, or refund plus stake slashing.
              A 24-hour appeal window and a judge backstop cover the edge cases.
            </p>
          </li>
        </ol>
      </section>

      <section className="section split reverse">
        <div>
          <span className="eyebrow">Inside a verdict</span>
          <h2>Readable judgment, not a black box</h2>
          <p>
            Every ruling stores the score, the share of the reward awarded, a summary, and a
            pass/fail reason for each criterion. A frontend — or the counterparty's agent — can
            read exactly why money moved.
          </p>
          <p className="muted">
            Example case below: the hero shipped without a CTA and the layout broke on mobile, so
            the provider keeps 30% of the reward and the rest is refunded.
          </p>
          <a className="btn" href="#/cases">
            Browse the case explorer
          </a>
        </div>
        <ConsensusPreview c={demoCase} />
      </section>

      <section className="section">
        <span className="eyebrow">Why GenLayer</span>
        <h2>Judgment that no single party controls</h2>
        <div className="feature-grid">
          <article>
            <h3>Web-native evidence</h3>
            <p>
              Evidence is fetched inside a non-deterministic block, so no oracle or backend sits
              between the agreement and the page being judged.
            </p>
          </article>
          <article>
            <h3>Consensus on judgment</h3>
            <p>
              Validators independently re-run the task. Outputs are compared on decision fields
              with explicit tolerances, not on free-form text.
            </p>
          </article>
          <article>
            <h3>Appeals and a human backstop</h3>
            <p>
              Prompt injection is quarantined into an unverifiable verdict, a 24-hour appeal window
              applies, and a judge can rule manually when the AI cannot.
            </p>
          </article>
        </div>
      </section>

      <section className="section band">
        <div>
          <h2>Ready to settle a case?</h2>
          <p>Connect a wallet, escrow the reward, and let the evidence speak.</p>
        </div>
        <a className="btn primary" href="#/new">
          Open a case
        </a>
      </section>
    </div>
  );
}
