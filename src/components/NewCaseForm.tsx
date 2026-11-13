import { useState } from "react";
import type { FormEvent } from "react";
import { deadlineToUnix, parseGenToWei } from "../lib/format";

type Props = {
  account: string;
  pending: boolean;
  inline?: boolean;
  onConnect: () => void;
  onCreate: (args: unknown[], value: bigint) => Promise<boolean>;
};

function defaultDeadline(): string {
  const target = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    target.getFullYear() +
    "-" +
    pad(target.getMonth() + 1) +
    "-" +
    pad(target.getDate()) +
    "T" +
    pad(target.getHours()) +
    ":" +
    pad(target.getMinutes())
  );
}

export default function NewCaseForm({ account, pending, inline, onConnect, onCreate }: Props) {
  const noWallet = !account;
  const [provider, setProvider] = useState("");
  const [title, setTitle] = useState("");
  const [specUrl, setSpecUrl] = useState("");
  const [rubric, setRubric] = useState(
    "1. Hero shows a CTA\n2. Layout is responsive on mobile"
  );
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [reward, setReward] = useState("1");
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (noWallet) {
      // The submit button asks for a wallet instead of sitting disabled.
      onConnect();
      return;
    }

    try {
      if (!/^0x[0-9a-fA-F]{40}$/.test(provider.trim())) {
        throw new Error("Enter a valid provider address.");
      }
      if (!/^https?:\/\//.test(specUrl.trim())) {
        throw new Error("Specification URL must be http/https.");
      }
      if (title.trim().length === 0) {
        throw new Error("Title is required.");
      }

      const criteria = rubric
        .split("\n")
        .filter((line) => line.trim().length > 0);
      if (criteria.length === 0) {
        throw new Error("Add at least one rubric criterion.");
      }
      if (criteria.length > 8) {
        throw new Error("Use at most 8 rubric criteria.");
      }

      const value = parseGenToWei(reward);
      const ok = await onCreate(
        [
          provider.trim(),
          title.trim(),
          specUrl.trim(),
          rubric.trim(),
          deadlineToUnix(deadline),
        ],
        value
      );

      if (ok) {
        setProvider("");
        setTitle("");
        setSpecUrl("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const form = (
    <form onSubmit={(event) => void submit(event)}>
      {noWallet && (
        <p className="muted smallText">Connect a wallet to escrow the reward.</p>
      )}

      <div className="field">
        <label htmlFor="provider">Provider address</label>
        <input
          id="provider"
          value={provider}
          placeholder="0x…"
          autoComplete="off"
          onChange={(event) => setProvider(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          value={title}
          placeholder="Landing page build"
          maxLength={140}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="spec-url">Specification URL</label>
        <input
          id="spec-url"
          value={specUrl}
          placeholder="https://…"
          maxLength={500}
          onChange={(event) => setSpecUrl(event.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="rubric">Rubric (one criterion per line, max 8)</label>
        <textarea
          id="rubric"
          rows={4}
          maxLength={3000}
          value={rubric}
          onChange={(event) => setRubric(event.target.value)}
        />
      </div>

      <div className="row">
        <div className="field">
          <label htmlFor="deadline">Evidence deadline</label>
          <input
            id="deadline"
            type="datetime-local"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="reward">Reward (GEN)</label>
          <input
            id="reward"
            inputMode="decimal"
            value={reward}
            onChange={(event) => setReward(event.target.value)}
          />
        </div>
      </div>

      {error && <p className="form-error">{error}</p>}

      <button type="submit" disabled={pending}>
        {pending
          ? "Sending…"
          : noWallet
            ? "Connect wallet to continue"
            : "Escrow reward and open case"}
      </button>
    </form>
  );

  if (inline) {
    return <div className="new-case inline">{form}</div>;
  }

  return (
    <details className="new-case">
      <summary>Open a new case</summary>
      {form}
    </details>
  );
}
