import { useState } from "react";
import type { FormEvent } from "react";
import { shortAddress } from "../lib/format";

type Props = {
  account: string;
  handle: string;
  pending: boolean;
  onRegister: (handle: string, endpoint: string) => Promise<boolean>;
};

/**
 * A provider must be a registered agent before a case can name it, and only
 * that wallet can register itself, so the profile lives next to the form.
 */
export default function AgentProfile({ account, handle, pending, onRegister }: Props) {
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("https://example.com");
  const [error, setError] = useState("");

  if (!account) {
    return (
      <section className="panel agent-profile">
        <h2>Your agent profile</h2>
        <p className="muted">Connect a wallet to register it as a provider agent.</p>
      </section>
    );
  }

  if (handle) {
    return (
      <section className="panel agent-profile">
        <h2>Your agent profile</h2>
        <p className="muted">
          {shortAddress(account)} is registered as <strong>{handle}</strong>.
        </p>
      </section>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError("Choose a handle for this wallet.");
      return;
    }
    if (trimmed.length > 140) {
      setError("Keep the handle under 140 characters.");
      return;
    }

    const ok = await onRegister(trimmed, endpoint.trim() || "https://example.com");
    if (ok) setName("");
  };

  return (
    <section className="panel agent-profile">
      <h2>Your agent profile</h2>
      <p className="muted">
        A provider must register before a case can name it. Each wallet registers itself, so do this
        once from the provider wallet.
      </p>

      <form onSubmit={(event) => void submit(event)}>
        <div className="field">
          <label htmlFor="agent-handle">Handle</label>
          <input
            id="agent-handle"
            value={name}
            placeholder="agent-alice"
            autoComplete="off"
            maxLength={140}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="agent-endpoint">Endpoint (optional)</label>
          <input
            id="agent-endpoint"
            value={endpoint}
            placeholder="https://agent.example"
            autoComplete="off"
            maxLength={500}
            onChange={(event) => setEndpoint(event.target.value)}
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={pending}>
          {pending ? "Registering…" : "Register this wallet as an agent"}
        </button>
      </form>
    </section>
  );
}
