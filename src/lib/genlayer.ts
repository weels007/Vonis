import { createClient } from "genlayer-js";
import { studionet, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { CaseView } from "./types";

const NETWORK =
  (import.meta.env.VITE_NETWORK as string | undefined) ?? "studionet";
const CHAIN = NETWORK === "testnetBradbury" ? testnetBradbury : studionet;

export const NETWORK_LABEL =
  NETWORK === "testnetBradbury" ? "Bradbury" : "Studionet";
export const CONTRACT_ADDRESS = (
  import.meta.env.VITE_CONTRACT_ADDRESS ?? ""
).trim();
export const IS_CONFIGURED = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);

export function explorerAddress(address: string): string {
  return NETWORK === "testnetBradbury"
    ? `https://scan.testnet-chain.genlayer.com/address/${address}`
    : `https://explorer-studio.genlayer.com/address/${address}`;
}

const readClient: any = createClient({ chain: CHAIN });

async function read(functionName: string, args: unknown[] = []): Promise<any> {
  return readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    stateStatus: "accepted",
  });
}

export async function getCaseCount(): Promise<number> {
  const raw = await read("get_case_count");
  return Number(raw);
}

export async function getCase(id: string): Promise<CaseView> {
  const raw = await read("get_case_json", [id]);
  const text = typeof raw === "string" ? raw : String(raw);
  return JSON.parse(text) as CaseView;
}

export async function getCreditOf(address: string): Promise<number> {
  const raw = await read("get_credit_of", [address]);
  return Number(raw);
}

export async function connectWallet(): Promise<string> {
  if (!window.ethereum) {
    throw new Error(
      "Wallet tidak ditemukan. Buka di browser dengan MetaMask atau wallet EIP-1193."
    );
  }
  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];
  if (!accounts || accounts.length === 0) {
    throw new Error("Wallet tidak mengembalikan akun.");
  }
  return accounts[0];
}

export async function writeVonis(
  account: string,
  functionName: string,
  args: unknown[] = [],
  value: bigint = 0n
): Promise<string> {
  if (!IS_CONFIGURED) {
    throw new Error("VITE_CONTRACT_ADDRESS belum diisi.");
  }

  const client: any = createClient({
    chain: CHAIN,
    account,
    provider: window.ethereum,
  });

  try {
    await client.connect(NETWORK === "testnetBradbury" ? "testnetBradbury" : "studionet");
  } catch {
    // If the wallet refuses to switch, writeContract reports the mismatch clearly.
  }

  const payload: any = {
    account,
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    value,
  };

  try {
    const estimate = await client.estimateTransactionFeesForWrite(payload);
    payload.fees = {
      distribution: estimate.distribution,
      messageAllocations: estimate.messageAllocations,
      feeValue: estimate.feeValue,
    };
  } catch {
    // Studio is gasless; leave fees unset when estimation is unavailable.
  }

  const hash = await client.writeContract(payload);
  await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
  });
  return String(hash);
}
