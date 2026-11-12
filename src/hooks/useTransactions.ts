import { useCallback, useMemo, useRef, useState } from "react";
import { friendlyError, rawError } from "../lib/errors";

export type TxStatus = "pending" | "success" | "error";

export type TxItem = {
  id: string;
  key: string;
  label: string;
  method: string;
  status: TxStatus;
  hash?: string;
  error?: string;
  errorDetail?: string;
  value?: string;
  startedAt: number;
  finishedAt?: number;
};

export type RunResult = { ok: boolean; hash?: string; error?: string };

const STORAGE_KEY = "vonis.tx.v1";

function load(): TxItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TxItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 20);
  } catch {
    return [];
  }
}

function persist(items: TxItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 20)));
  } catch {
    // Storage can be unavailable (private mode); history is best-effort.
  }
}

/**
 * Transaction queue with per-action locks.
 *
 * `run(key, ...)` refuses to start a second action with the same key while one
 * is pending, which is what stops double clicks from opening two wallet
 * prompts or submitting the same write twice.
 */
export function useTransactions() {
  const [items, setItems] = useState<TxItem[]>(load);
  const locks = useRef<Set<string>>(new Set());

  const commit = useCallback((updater: (current: TxItem[]) => TxItem[]) => {
    setItems((current) => {
      const next = updater(current).slice(0, 20);
      persist(next);
      return next;
    });
  }, []);

  const run = useCallback(
    async (
      key: string,
      label: string,
      method: string,
      action: () => Promise<string>
    ): Promise<RunResult> => {
      if (locks.current.has(key)) {
        return { ok: false, error: "This action is already in progress." };
      }

      locks.current.add(key);
      const id = key + ":" + Date.now();
      const startedAt = Date.now();

      commit((current) => [
        { id, key, label, method, status: "pending", startedAt },
        ...current,
      ]);

      try {
        const hash = await action();
        commit((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, status: "success", hash, finishedAt: Date.now() }
              : item
          )
        );
        return { ok: true, hash };
      } catch (error) {
        const message = friendlyError(error);
        commit((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "error",
                  error: message,
                  errorDetail: rawError(error),
                  finishedAt: Date.now(),
                }
              : item
          )
        );
        return { ok: false, error: message };
      } finally {
        locks.current.delete(key);
      }
    },
    [commit]
  );

  const pendingKeys = useMemo(
    () =>
      new Set(
        items.filter((item) => item.status === "pending").map((item) => item.key)
      ),
    [items]
  );

  const clearHistory = useCallback(() => commit(() => []), [commit]);

  return { items, pendingKeys, run, clearHistory };
}
