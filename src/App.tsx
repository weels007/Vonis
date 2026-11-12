import { useCallback, useEffect, useMemo, useState } from "react";
import CaseDetail from "./components/CaseDetail";
import CaseList from "./components/CaseList";
import ConnectButton from "./components/ConnectButton";
import NewCaseForm from "./components/NewCaseForm";
import Toast from "./components/Toast";
import TxPanel from "./components/TxPanel";
import { useTransactions } from "./hooks/useTransactions";
import type { TxItem } from "./hooks/useTransactions";
import { DEMO_CASES } from "./lib/demo";
import { friendlyError, rawError } from "./lib/errors";
import {
  CONTRACT_ADDRESS,
  IS_CONFIGURED,
  NETWORK_LABEL,
  explorerAddress,
  getCase,
  getCaseCount,
  getCreditOf,
  writeVonis,
} from "./lib/genlayer";
import { formatGen, shortAddress } from "./lib/format";
import type { CaseView } from "./lib/types";
import {
  connectWallet,
  currentChainId,
  ensureNetwork,
  getBalanceWei,
  silentAccount,
  watchWallet,
} from "./lib/wallet";

function makeToast(
  label: string,
  method: string,
  ok: boolean,
  hash?: string,
  error?: string,
  detail?: string
): TxItem {
  return {
    id: label + ":" + Date.now(),
    key: "toast",
    label,
    method,
    status: ok ? "success" : "error",
    hash,
    error,
    errorDetail: detail,
    startedAt: Date.now(),
  };
}

export default function App() {
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [cases, setCases] = useState<CaseView[]>(IS_CONFIGURED ? [] : DEMO_CASES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [demo, setDemo] = useState(!IS_CONFIGURED);
  const [error, setError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [credit, setCredit] = useState(0);
  const [balance, setBalance] = useState(0n);
  const [toast, setToast] = useState<TxItem | null>(null);
  const [txOpen, setTxOpen] = useState(false);
  const [focusHash, setFocusHash] = useState<string | null>(null);

  const { items, pendingKeys, run, clearHistory } = useTransactions();

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
          // Skip a case that cannot be decoded instead of failing the list.
        }
      }
      setCases(list);
      setDemo(false);
      setError("");
      setSelectedId((current) => current ?? (list[0]?.id ?? null));
    } catch (err) {
      setError(friendlyError(err));
      setDemo(true);
      setCases(DEMO_CASES);
    }
  }, []);

  const loadWallet = useCallback(async (who: string) => {
    if (!who) {
      setCredit(0);
      setBalance(0n);
      return;
    }
    setBalance(await getBalanceWei(who));
    if (!IS_CONFIGURED) return;
    try {
      setCredit(await getCreditOf(who));
    } catch {
      // Credit is a convenience: a failed read should not block the app.
    }
  }, []);

  useEffect(() => {
    let alive = true;

    void (async () => {
      const who = await silentAccount();
      const chain = await currentChainId();
      if (!alive) return;
      if (who) {
        setAccount(who);
        void loadWallet(who);
      }
      setChainId(chain);
    })();

    const unwatch = watchWallet((nextAccount, nextChain) => {
      if (nextChain !== null) setChainId(nextChain);
      setAccount(nextAccount);
      if (nextAccount) void loadWallet(nextAccount);
    });

    return () => {
      alive = false;
      unwatch();
    };
  }, [loadWallet]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(timer);
  }, [toast]);

  const selected = useMemo(
    () => cases.find((item) => item.id === selectedId) ?? cases[0] ?? null,
    [cases, selectedId]
  );

  const handleConnect = async () => {
    if (connecting) return;
    try {
      setConnecting(true);
      const who = await connectWallet();
      setAccount(who);
      setChainId(await currentChainId());
      await loadWallet(who);
    } catch (err) {
      setToast(
        makeToast(
          "Hubungkan wallet",
          "eth_requestAccounts",
          false,
          undefined,
          friendlyError(err),
          rawError(err)
        )
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleSwitch = async () => {
    try {
      await ensureNetwork();
      setChainId(await currentChainId());
    } catch (err) {
      setToast(
        makeToast(
          "Ganti jaringan",
          "wallet_switchEthereumChain",
          false,
          undefined,
          friendlyError(err),
          rawError(err)
        )
      );
    }
  };

  const handleAction = async (
    key: string,
    label: string,
    method: string,
    args: unknown[],
    value: bigint = 0n
  ): Promise<boolean> => {
    if (!account) {
      setToast(makeToast(label, method, false, undefined, "Hubungkan wallet dulu."));
      return false;
    }

    const result = await run(key, label, method, async () => {
      const out = await writeVonis(account, method, args, value);
      return out.hash;
    });

    setToast(makeToast(label, method, result.ok, result.hash, result.error));
    if (result.ok) {
      await refresh();
      await loadWallet(account);
    }
    return result.ok;
  };

  const handleWithdraw = async () => {
    const ok = await handleAction("withdraw", "Klaim dana", "withdraw", []);
    if (ok) setCredit(0);
  };

  const pendingCount = items.filter((item) => item.status === "pending").length;

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
          {account && <span className="chip muted">{formatGen(Number(balance))}</span>}
          <ConnectButton
            account={account}
            chainId={chainId}
            connecting={connecting}
            onConnect={() => void handleConnect()}
            onSwitch={() => void handleSwitch()}
          />
          {credit > 0 && (
            <button
              className="btn primary"
              type="button"
              disabled={pendingKeys.has("withdraw")}
              onClick={() => void handleWithdraw()}
            >
              {pendingKeys.has("withdraw") ? "Mengklaim…" : "Klaim " + formatGen(credit)}
            </button>
          )}
          <button
            className="btn ghost"
            type="button"
            onClick={() => {
              setFocusHash(null);
              setTxOpen(true);
            }}
          >
            Transaksi{pendingCount > 0 ? " (" + pendingCount + ")" : ""}
          </button>
        </div>
      </header>

      {demo && (
        <div className="banner">
          Mode demo — menampilkan data contoh. Isi <code>VITE_CONTRACT_ADDRESS</code> di
          <code> .env.local</code> untuk membaca kontrak nyata.
        </div>
      )}

      {error && <div className="toast error">{error}</div>}

      <main className="grid">
        <section className="panel">
          <div className="panel-head">
            <h2>Kasus</h2>
            <span className="chip">{cases.length}</span>
          </div>

          <CaseList cases={cases} selectedId={selected?.id ?? null} onSelect={setSelectedId} />

          <NewCaseForm
            disabled={!account}
            pending={pendingKeys.has("create-case")}
            onCreate={(args, value) =>
              handleAction("create-case", "Buat kasus", "open_case", args, value)
            }
          />
        </section>

        <section className="panel detail-panel">
          {selected ? (
            <CaseDetail
              c={selected}
              account={account}
              pendingKeys={pendingKeys}
              onAction={(key, label, method, args, value) =>
                void handleAction(key, label, method, args, value)
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

      {toast && (
        <div className="toasts">
          <Toast
            item={toast}
            onOpen={(hash) => {
              setFocusHash(hash);
              setTxOpen(true);
            }}
            onDismiss={() => setToast(null)}
          />
        </div>
      )}

      <TxPanel
        open={txOpen}
        items={items}
        focusHash={focusHash}
        onClose={() => setTxOpen(false)}
        onClear={() => {
          clearHistory();
          setTxOpen(false);
        }}
      />
    </div>
  );
}
