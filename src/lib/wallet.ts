import { studionet, testnetBradbury } from "genlayer-js/chains";

export const NETWORK =
  (import.meta.env.VITE_NETWORK as string | undefined) ?? "studionet";
export const CHAIN = NETWORK === "testnetBradbury" ? testnetBradbury : studionet;
export const NETWORK_LABEL =
  NETWORK === "testnetBradbury" ? "Bradbury" : "Studionet";

let connectInFlight: Promise<string> | null = null;

export function hasWallet(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

/** Reads already-authorised accounts without triggering a wallet popup. */
export async function silentAccount(): Promise<string> {
  if (!hasWallet()) return "";
  try {
    const accounts = (await window.ethereum!.request({
      method: "eth_accounts",
    })) as string[];
    return accounts?.[0] ?? "";
  } catch {
    return "";
  }
}

export async function currentChainId(): Promise<number | null> {
  if (!hasWallet()) return null;
  try {
    const hex = (await window.ethereum!.request({ method: "eth_chainId" })) as string;
    const value = Number.parseInt(hex, 16);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Single in-flight connect promise: rapid double clicks share one wallet
 * prompt instead of stacking them.
 */
export function connectWallet(): Promise<string> {
  if (!hasWallet()) {
    return Promise.reject(
      new Error("Wallet tidak ditemukan. Buka lewat browser dengan MetaMask.")
    );
  }

  if (!connectInFlight) {
    connectInFlight = (async () => {
      try {
        const accounts = (await window.ethereum!.request({
          method: "eth_requestAccounts",
        })) as string[];
        if (!accounts || accounts.length === 0) {
          throw new Error("Wallet tidak mengembalikan akun.");
        }
        localStorage.setItem("vonis.wallet.connected", "1");
        return accounts[0];
      } finally {
        // Keep the promise for the current tick so concurrent clicks share it,
        // then allow a retry (e.g. after the user rejected and tries again).
        window.setTimeout(() => {
          connectInFlight = null;
        }, 0);
      }
    })();
  }

  return connectInFlight;
}

export async function ensureNetwork(): Promise<void> {
  if (!hasWallet()) throw new Error("Wallet tidak ditemukan.");
  const chainId = await currentChainId();
  if (chainId === CHAIN.id) return;

  const hex = "0x" + CHAIN.id.toString(16);
  try {
    await window.ethereum!.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hex }],
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 4902) throw error;
    await window.ethereum!.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hex,
          chainName: CHAIN.name,
          nativeCurrency: CHAIN.nativeCurrency,
          rpcUrls: [...CHAIN.rpcUrls.default.http],
          blockExplorerUrls: CHAIN.blockExplorers?.default?.url
            ? [CHAIN.blockExplorers.default.url]
            : [],
        },
      ],
    });
  }
}

export type WalletWatcher = (account: string, chainId: number | null) => void;

export function watchWallet(onChange: WalletWatcher): () => void {
  const eth = window.ethereum as any;
  if (!eth?.on) return () => {};

  const handleAccounts = (accounts: unknown) => {
    const list = Array.isArray(accounts) ? (accounts as string[]) : [];
    onChange(list[0] ?? "", null);
  };

  const handleChain = async (chainHex: unknown) => {
    const value = Number.parseInt(String(chainHex), 16);
    const who = await silentAccount();
    onChange(who, Number.isFinite(value) ? value : null);
  };

  eth.on("accountsChanged", handleAccounts);
  eth.on("chainChanged", handleChain);

  return () => {
    eth.removeListener?.("accountsChanged", handleAccounts);
    eth.removeListener?.("chainChanged", handleChain);
  };
}

export async function getBalanceWei(account: string): Promise<bigint> {
  if (!hasWallet() || !account) return 0n;
  try {
    const hex = (await window.ethereum!.request({
      method: "eth_getBalance",
      params: [account, "latest"],
    })) as string;
    return BigInt(hex);
  } catch {
    return 0n;
  }
}
