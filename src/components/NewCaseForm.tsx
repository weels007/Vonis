import { useState } from "react";
import type { FormEvent } from "react";
import { deadlineToUnix, parseGenToWei } from "../lib/format";

type Props = {
  busy: boolean;
  onCreate: (args: unknown[], value: bigint) => void;
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

export default function NewCaseForm({ busy, onCreate }: Props) {
  const [provider, setProvider] = useState("");
  const [title, setTitle] = useState("");
  const [specUrl, setSpecUrl] = useState("");
  const [rubric, setRubric] = useState(
    "1. Hero menampilkan CTA\n2. Layout responsif di mobile"
  );
  const [deadline, setDeadline] = useState(defaultDeadline());
  const [reward, setReward] = useState("1");
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      if (!/^0x[0-9a-fA-F]{40}$/.test(provider.trim())) {
        throw new Error("Alamat provider tidak valid.");
      }
      if (!/^https?:\/\//.test(specUrl.trim())) {
        throw new Error("URL spesifikasi harus http/https.");
      }
      const value = parseGenToWei(reward);
      onCreate(
        [
          provider.trim(),
          title.trim(),
          specUrl.trim(),
          rubric.trim(),
          deadlineToUnix(deadline),
        ],
        value
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <details className="new-case">
      <summary>Buat kasus baru</summary>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="provider">Alamat provider</label>
          <input
            id="provider"
            value={provider}
            placeholder="0x…"
            onChange={(event) => setProvider(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="title">Judul</label>
          <input
            id="title"
            value={title}
            placeholder="Landing page build"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="spec-url">URL spesifikasi</label>
          <input
            id="spec-url"
            value={specUrl}
            placeholder="https://…"
            onChange={(event) => setSpecUrl(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="rubric">Rubrik (satu kriteria per baris, maks 8)</label>
          <textarea
            id="rubric"
            rows={4}
            value={rubric}
            onChange={(event) => setRubric(event.target.value)}
          />
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="deadline">Tenggat bukti</label>
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

        <button type="submit" disabled={busy}>
          {busy ? "Mengirim…" : "Kunci reward dan buka kasus"}
        </button>
      </form>
    </details>
  );
}
