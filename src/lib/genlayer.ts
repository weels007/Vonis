import { createClient } from "genlayer-js";
import { TransactionHashVariant, TransactionStatus } from "genlayer-js/types";
import type { CaseView } from "./types";
import { CHAIN, NETWORK, ensureNetwork } from "./wallet";

export { NETWORK_LABEL } from "./wallet";

export const CONTRACT_ADDRESS = (
  import.meta.env.VITE_CONTRACT_ADDRESS ?? ""
).trim();
export const IS_CONFIGURED = /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);

const readClient: any = createClient({ chain: CHAIN });

function explorerBase(): string {
  return NETWORK === "testnetBradbury"
    ? "https://scan.testnet-chain.genlayer.com"
    : "https://explorer-studio.genlayer.com";
}

export function explorerAddress(address: string): string {
  return explorerBase() + "/address/" + address;
}

export function explorerTx(hash: string): string {
  return explorerBase() + "/tx/" + hash;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function read(functionName: string, args: unknown[] = []): Promise<any> {
  return readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL,
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

export type WriteResult = {
  hash: string;
  execution: string;
};

export async function writeVonis(
  account: string,
  functionName: string,
  args: unknown[] = [],
  value: bigint = 0n
): Promise<WriteResult> {
  if (!IS_CONFIGURED) {
    throw new Error("VITE_CONTRACT_ADDRESS is not set.");
  }
  if (!window.ethereum) {
    throw new Error("No wallet found.");
  }

  await ensureNetwork();

  const client: any = createClient({
    chain: CHAIN,
    account: account as `0x${string}`,
    provider: window.ethereum,
  });

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
    // Studio is gasless; if estimation fails we still try the write.
  }

  const hash: string = await client.writeContract(payload);

  const receipt: any = await withTimeout(
    client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
    }),
    180_000,
    "Transaction timed out after 3 minutes."
  );

  const execution = String(receipt?.txExecutionResultName ?? "UNKNOWN");

  if (execution === "FINISHED_WITH_ERROR") {
    throw new Error(
      "Transaction accepted but contract execution failed (FINISHED_WITH_ERROR). Check the transaction details."
    );
  }

  return { hash, execution };
}
