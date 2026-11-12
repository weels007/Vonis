import { useCallback, useEffect, useState } from "react";
import SiteHeader from "./components/SiteHeader";
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
  getCase,
  getCaseCount,
  getCreditOf,
  writeVonis,
} from "./lib/genlayer";
import { navigate, useRoute } from "./lib/router";
import type { CaseView } from "./lib/types";
import {
  connectWallet,
  currentChainId,
  ensureNetwork,
  getBalanceWei,
  silentAccount,
  watchWallet,
} from "./lib/wallet";
import CaseDetailPage from "./pages/CaseDetailPage";
import CasesPage from "./pages/Cases";
import Landing from "./pages/Landing";
import NewCase from "./pages/NewCase";
import Transactions from "./pages/Transactions";

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
  const route = useRoute();
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [cases, setCases] = useState<CaseView[]>(IS_CONFIGURED ? [] : DEMO_CASES);
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
          "Connect wallet",
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
          "Switch network",
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
      setToast(makeToast(label, method, false, undefined, "Connect a wallet first."));
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

  const handleCreate = async (args: unknown[], value: bigint): Promise<boolean> => {
    const ok = await handleAction("create-case", "Open case", "open_case", args, value);
    if (ok) navigate({ name: "cases" });
    return ok;
  };

  const handleWithdraw = async () => {
    const ok = await handleAction("withdraw", "Claim funds", "withdraw", []);
    if (ok) setCredit(0);
  };

  const pendingCount = items.filter((item) => item.status === "pending").length;

  return (
    <div className="site">
      <SiteHeader
        routeName={route.name}
        networkLabel={NETWORK_LABEL}
        configured={IS_CONFIGURED}
        contractAddress={CONTRACT_ADDRESS}
        account={account}
        chainId={chainId}
        connecting={connecting}
        credit={credit}
        balance={balance}
        pendingWithdraw={pendingKeys.has("withdraw")}
        pendingCount={pendingCount}
        onConnect={() => void handleConnect()}
        onSwitch={() => void handleSwitch()}
        onWithdraw={() => void handleWithdraw()}
      />

      <main className="content">
        {error && <div className="toast error error-banner">{error}</div>}

        {route.name === "landing" ? (
          <Landing demoCase={DEMO_CASES[0]} />
        ) : (
          <>
            {demo && (
              <div className="banner">
                Demo data — the contract address in <code>src/lib/genlayer.ts</code> is empty or
                invalid, so the live contract cannot be read.
              </div>
            )}

            {route.name === "cases" && <CasesPage cases={cases} />}

            {route.name === "case" && (
              <CaseDetailPage
                caseId={route.id}
                cases={cases}
                account={account}
                pendingKeys={pendingKeys}
                onAction={(key, label, method, args, value) =>
                  void handleAction(key, label, method, args, value)
                }
              />
            )}

            {route.name === "new" && (
              <NewCase
                account={account}
                pending={pendingKeys.has("create-case")}
                onCreate={handleCreate}
              />
            )}

            {route.name === "transactions" && (
              <Transactions items={items} onClear={clearHistory} />
            )}
          </>
        )}
      </main>

      <footer className="site-footer">
        <span>Vonis · GenLayer Intelligent Contract</span>
        <span>Case data refreshes every 15 seconds.</span>
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
