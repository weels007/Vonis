import { useCallback, useEffect, useMemo, useState } from "react";
import CaseDetail from "./components/CaseDetail";
import CaseList from "./components/CaseList";
import NewCaseForm from "./components/NewCaseForm";
import { DEMO_CASES } from "./lib/demo";
import {
  CONTRACT_ADDRESS,
  IS_CONFIGURED,
  NETWORK_LABEL,
  connectWallet,
  explorerAddress,
  getCase,
  getCaseCount,
  getCreditOf,
  writeVonis,
} from "./lib/genlayer";
import { actionError, formatGen, shortAddress } from "./lib/format";
import type { CaseView } from "./lib/types";

export default function App() {
  const [account, setAccount] = useState("");
  const [cases, setCases] = useState<CaseView[]>(IS_CONFIGURED ? [] : DEMO_CASES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [demo, setDemo] = useState(!IS_CONFIGURED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [credit, setCredit] = useState(0);

  const refresh = useCallback(async () => {
    if (!IS_CONFIGURED) {
      setCases(DEMO_CASES);
      setDemo(true);
      return;
    }

    try {
      const count = await getCaseCount();
      const ids = Array.from({ length: count }, (_, i) => `case-${i}`)
        .slice(-50)
        .reverse();
      const list: CaseView[] = [];
      for (const id of ids) {
        try {
          list.push(await getCase(id));
        } catch {
          // Skip cases that cannot be decoded instead of failing the whole list.
        }
      }
      setCases(list);
      setDemo(false);
      setError("");
      setSelectedId((current) => current ?? (list[0]?.id ?? null));
    } catch (err) {
      setError(actionError(err));
      setDemo(true);
      setCases(DEMO_CASES);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  const loadCredit = useCallback(async (who: string) => {
    if (!IS_CONFIGURED || !who) return;
    try {
      setCredit(await getCreditOf(who));
    } catch {
      // Non-critical: the header simply shows no claim button.
    }
  }, []);

  useEffect(() => {
    void loadCredit(account);
  }, [account, loadCredit]);

  const selected = useMemo(
    () => cases.find((item) => item.id === selectedId) ?? cases[0] ?? null,
    [cases, selectedId]
  );

  const handleWrite = async (
    functionName: string,
    args: unknown[],
    value: bigint = 0n
  ) => {
    if (!account) {
      setError("Hubungkan wallet dulu.");
      return;
    }

    try {
      setBusy(true);
      setError("");
      const hash = await writeVonis(account, functionName, args, value);
      setNotice("Transaksi terkirim: " + shortAddress(hash));
      await refresh();
      await loadCredit(account);
    } catch (err) {
      setError(actionError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async () => {
    try {
      setError("");
      const who = await connectWallet();
      setAccount(who);
      await loadCredit(who);
    } catch (err) {
      setError(actionError(err));
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="mark">V</div>
          <div>
            <h1>Vonis</h1>
            <p>Pengadilan sengketa agen, diputus oleh consensus AI.</p>
          </div>
        </div>

        <div className="topbar-actions">
          <span className="chip">{NETWORK_LABEL}</span>
          {IS_CONFIGURED ? (
            <a
              className="chip link"
              href={explorerAddress(CONTRACT_ADDRESS)}
              target="_blank"
              rel="noreferrer"
            >
              {shortAddress(CONTRACT_ADDRESS)}
            </a>
          ) : (
            <span className="chip warn">kontrak belum diatur</span>
          )}
          <button className="btn" onClick={() => void handleConnect()}>
            {account ? shortAddress(account) : "Hubungkan wallet"}
          </button>
          {credit > 0 && (
            <button
              className="btn primary"
              disabled={busy}
              onClick={() => void handleWrite("withdraw", [])}
            >
              Klaim {formatGen(credit)}
            </button>
          )}
        </div>
      </header>

      {demo && (
        <div className="banner">
          Mode demo — menampilkan data contoh. Isi <code>VITE_CONTRACT_ADDRESS</code> di
          <code> .env.local</code> untuk membaca kontrak nyata.
        </div>
      )}

      {error && <div className="toast error">{error}</div>}
      {notice && <div className="toast ok">{notice}</div>}

      <main className="grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Kasus</h2>
            <span className="chip">{cases.length}</span>
          </div>

          <CaseList cases={cases} selectedId={selected?.id ?? null} onSelect={setSelectedId} />

          <NewCaseForm
            busy={busy || !account}
            onCreate={(args, value) => void handleWrite("open_case", args, value)}
          />
        </section>

        <section className="panel detail-panel">
          {selected ? (
            <CaseDetail
              c={selected}
              account={account}
              busy={busy}
              onAction={(functionName, args, value) =>
                void handleWrite(functionName, args, value)
              }
            />
          ) : (
            <p className="muted">Belum ada kasus.</p>
          )}
        </section>
      </main>

      <footer className="foot">
        <span>Vonis · Intelligent Contract GenLayer</span>
        <span>Data dibaca ulang setiap 15 detik.</span>
      </footer>
    </div>
  );
}
