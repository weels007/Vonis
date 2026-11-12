import { createClient } from "genlayer-js";
import { TransactionHashVariant, TransactionStatus } from "genlayer-js/types";
import type { CaseView } from "./types";
import { CHAIN, NETWORK, ensureNetwork } from "./wallet";

export { NETWORK_LABEL } from "./wallet";

// The contract address is hard-set here, not read from the environment: the
// published preview has to work without a build-time variable. It points at the
// latest Studionet deployment (see the `studionet` workflow's step summary);
// Studionet state is temporary, so replace this value when a run reports a new
// address.
export const CONTRACT_ADDRESS = "0xDD6b10390f3F2a5d676f76036a906f44242C7a65";

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

export async function getJudge(): Promise<string> {
  return String(await read("get_judge"));
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
    throw new Error("Contract address is not configured.");
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

  // Newer nodes leave txExecutionResultName empty and report the outcome in
  // the leader receipt, so a rejected call must not look like a success.
  const leader = receipt?.consensus_data?.leader_receipt?.[0] ?? null;
  const execution = String(receipt?.txExecutionResultName ?? "UNKNOWN");
  const leaderExecution = String(leader?.execution_result ?? "").toUpperCase();
  const failed =
    execution === "FINISHED_WITH_ERROR" ||
    leaderExecution === "ERROR" ||
    leaderExecution === "FAILURE";

  if (failed) {
    const reason = leader?.error ?? leader?.genvm_result?.error ?? "";
    throw new Error(
      "Contract execution failed (" +
        (execution === "UNKNOWN" ? leaderExecution || "UNKNOWN" : execution) +
        ")" +
        (reason ? ": " + String(reason).slice(0, 240) : ".")
    );
  }

  return {
    hash,
    execution: execution === "UNKNOWN" ? leaderExecution || "UNKNOWN" : execution,
  };
}

