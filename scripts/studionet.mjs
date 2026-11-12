/**
 * Deploy Vonis to Studionet and exercise its methods with the two test wallets.
 *
 * Credentials come from environment variables (GitHub Actions secrets); nothing
 * is written to disk. Set RUN_ADJUDICATION=1 to include the real LLM dispute
 * path, which can take several minutes.
 */
import { readFileSync, appendFileSync } from "node:fs";
import { Wallet } from "ethers";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { createPublicClient, http, parseEther, formatEther } from "viem";

const REQUIRED = 3n * 10n ** 18n;
const ONE_GEN = parseEther("1");
const SPEC_URL = "https://example.com";
const EVIDENCE_URL = "https://example.com";
const RUBRIC = "1. The page loads\n2. The page contains the word Example";

const results = [];
let failures = 0;

function log(line) {
  console.log(line);
}

function pass(label, detail = "") {
  results.push({ label, ok: true, detail });
  log(`PASS ${label}${detail ? " — " + detail : ""}`);
}

function fail(label, detail = "") {
  failures += 1;
  results.push({ label, ok: false, detail });
  log(`FAIL ${label}${detail ? " — " + detail : ""}`);
}

function skip(label, detail) {
  results.push({ label, ok: null, detail });
  log(`SKIP ${label}${detail ? " — " + detail : ""}`);
}

function summary() {
  const lines = [
    "## Studionet run",
    "",
    "| Check | Result | Detail |",
    "| --- | --- | --- |",
    ...results.map(
      (item) =>
        `| ${item.label} | ${item.ok === true ? "pass" : item.ok === false ? "FAIL" : "skip"} | ${
          (item.detail || "").replace(/\|/g, "\\|").slice(0, 160)
        } |`
    ),
  ];
  const text = lines.join("\n") + "\n";
  log("\n" + text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  }
}

function wallet(prefix) {
  const json = process.env[`${prefix}_KEYSTORE`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!json || !password) return null;
  return Wallet.fromEncryptedJson(json, password);
}

function clientFor(account) {
  return createClient({ chain: studionet, account });
}

async function read(client, address, functionName, args = []) {
  return client.readContract({ address, functionName, args });
}

async function wait(client, hash, label) {
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
  });
  const execution = String(receipt?.txExecutionResultName ?? "UNKNOWN");
  if (execution === "FINISHED_WITH_ERROR") {
    throw new Error(`${label}: execution failed (${execution})`);
  }
  return receipt;
}

async function write(client, address, functionName, args = [], value = 0n) {
  const hash = await client.writeContract({ address, functionName, args, value });
  await wait(client, hash, functionName);
  return hash;
}

async function writeExpectFailure(client, address, functionName, args = [], value = 0n) {
  try {
    const hash = await client.writeContract({ address, functionName, args, value });
    const receipt = await client.waitForTransactionReceipt({
      hash,
      status: TransactionStatus.ACCEPTED,
    });
    const execution = String(receipt?.txExecutionResultName ?? "UNKNOWN");
    return { failed: execution === "FINISHED_WITH_ERROR", detail: execution };
  } catch (error) {
    return { failed: true, detail: String(error?.message ?? error).slice(0, 160) };
  }
}

async function main() {
  log(
    "credentials present: " +
      ["TEST1_KEYSTORE", "TEST1_PASSWORD", "TEST2_KEYSTORE", "TEST2_PASSWORD"]
        .map((key) => key + "=" + (process.env[key] ? "yes" : "no"))
        .join(", ")
  );

  const w1 = await wallet("TEST1");
  const w2 = await wallet("TEST2");

  if (!w1) {
    fail("wallets", "TEST1_KEYSTORE / TEST1_PASSWORD are not configured");
    summary();
    process.exit(1);
  }

  const account1 = createAccount(w1.privateKey);
  const account2 = w2 ? createAccount(w2.privateKey) : null;
  const c1 = clientFor(account1);
  const c2 = account2 ? clientFor(account2) : null;

  pass("wallets", `${account1.address}${account2 ? " + " + account2.address : " (single wallet)"}`);

  const publicClient = createPublicClient({
    chain: studionet,
    transport: http(studionet.rpcUrls.default.http[0]),
  });

  const balance = await publicClient.getBalance({ address: account1.address });
  pass("deployer balance", `${formatEther(balance)} GEN`);

  const code = readFileSync("contracts/vonis.py", "utf8");
  const deployHash = await c1.deployContract({ code });
  await wait(c1, deployHash, "deploy");

  const tx = await c1.getTransaction({ hash: deployHash });
  const address =
    tx?.txDataDecoded?.contractAddress ?? tx?.recipient ?? tx?.to_address ?? null;
  if (!address) {
    fail("contract address", "deploy receipt had no contractAddress");
    summary();
    process.exit(1);
  }
  pass("deployed", address);

  if (process.env.GITHUB_ENV) {
    appendFileSync(process.env.GITHUB_ENV, `CONTRACT_ADDRESS=${address}\n`);
  }

  try {
    const count = await read(c1, address, "get_case_count");
    pass("get_case_count", String(count));
    if (Number(count) !== 0) fail("fresh contract", "case_count is not zero");
  } catch (error) {
    fail("get_case_count", String(error?.message ?? error));
  }

  try {
    const judge = await read(c1, address, "get_judge");
    pass("get_judge", String(judge));
  } catch (error) {
    fail("get_judge", String(error?.message ?? error));
  }

  // Registry: both agents register, then read their profile back.
  try {
    await write(c1, address, "register_agent", ["requester-agent", "https://example.com"]);
    pass("register_agent(requester)");
  } catch (error) {
    fail("register_agent(requester)", String(error?.message ?? error));
  }

  if (c2) {
    try {
      await write(c2, address, "register_agent", ["provider-agent", "https://example.com"]);
      pass("register_agent(provider)");
    } catch (error) {
      fail("register_agent(provider)", String(error?.message ?? error));
    }
  }

  try {
    const handle = await read(c1, address, "get_agent_handle", [account1.address]);
    pass("get_agent_handle", String(handle));
    const score = await read(c1, address, "get_agent_score", [account1.address]);
    pass("get_agent_score", String(score));
  } catch (error) {
    fail("agent reads", String(error?.message ?? error));
  }

  if (!c2) {
    skip("case lifecycle", "second wallet (TEST2) is not configured");
    summary();
    process.exit(failures > 0 ? 1 : 0);
  }

  if (balance < REQUIRED) {
    skip(
      "case lifecycle",
      `deployer has ${formatEther(balance)} GEN, needs at least ${formatEther(REQUIRED)}`
    );
    summary();
    process.exit(failures > 0 ? 1 : 0);
  }

  // Stake deposit and withdrawal.
  try {
    await write(c1, address, "deposit_stake", [], parseEther("0.2"));
    const stake = await read(c1, address, "get_agent_stake", [account1.address]);
    pass("deposit_stake", String(stake));
  } catch (error) {
    fail("deposit_stake", String(error?.message ?? error));
  }

  // Case 1: fast path.
  let caseId = null;
  try {
    await write(
      c1,
      address,
      "open_case",
      [account2.address, "Studionet smoke case", SPEC_URL, RUBRIC, 4102444800],
      ONE_GEN
    );
    caseId = "case-0";
    pass("open_case", caseId);
  } catch (error) {
    fail("open_case", String(error?.message ?? error));
  }

  if (caseId) {
    try {
      await write(c2, address, "accept_case", [caseId]);
      pass("accept_case");
    } catch (error) {
      fail("accept_case", String(error?.message ?? error));
    }

    try {
      await write(c2, address, "deliver_case", [caseId, EVIDENCE_URL]);
      pass("deliver_case");
    } catch (error) {
      fail("deliver_case", String(error?.message ?? error));
    }

    // Adversarial: non-judge cannot rule.
    const notJudge = await writeExpectFailure(c2, address, "judge_rule", [caseId, 5000, "nope"]);
    if (notJudge.failed) pass("judge_rule is judge-only", notJudge.detail);
    else fail("judge_rule is judge-only", "non-judge call succeeded");

    try {
      await write(c1, address, "accept_delivery", [caseId]);
      pass("accept_delivery");
    } catch (error) {
      fail("accept_delivery", String(error?.message ?? error));
    }

    try {
      const json = JSON.parse(String(await read(c1, address, "get_case_json", [caseId])));
      pass("get_case_json", `${json.status}/${json.verdict}`);
      if (json.status !== "SETTLED") fail("fast path settled", json.status);
      if (json.verdict !== "ACCEPTED") fail("fast path verdict", json.verdict);
    } catch (error) {
      fail("get_case_json", String(error?.message ?? error));
    }

    try {
      await write(c2, address, "withdraw");
      const credit = await read(c1, address, "get_credit_of", [account2.address]);
      pass("withdraw", `credit now ${credit}`);
    } catch (error) {
      fail("withdraw", String(error?.message ?? error));
    }
  }

  // Case 2: cancel and refund.
  try {
    await write(
      c1,
      address,
      "open_case",
      [account2.address, "Cancel me", SPEC_URL, RUBRIC, 4102444800],
      ONE_GEN
    );
    await write(c1, address, "cancel_case", ["case-1"]);
    const json = JSON.parse(String(await read(c1, address, "get_case_json", ["case-1"])));
    pass("cancel_case", `${json.status}/${json.verdict}`);
    if (json.status !== "SETTLED") fail("cancel settled", json.status);
  } catch (error) {
    fail("cancel_case", String(error?.message ?? error));
  }

  // Adversarial: oversized evidence.
  try {
    await write(
      c1,
      address,
      "open_case",
      [account2.address, "Evidence limits", SPEC_URL, RUBRIC, 4102444800],
      ONE_GEN
    );
    await write(c2, address, "accept_case", ["case-2"]);
    const oversized = await writeExpectFailure(c2, address, "deliver_case", [
      "case-2",
      "https://example.com/" + "a".repeat(900),
    ]);
    if (oversized.failed) pass("oversized evidence rejected", oversized.detail);
    else fail("oversized evidence rejected", "call succeeded");
  } catch (error) {
    fail("oversized evidence", String(error?.message ?? error));
  }

  // Dispute path with real validators. Optional because it costs minutes.
  if (process.env.RUN_ADJUDICATION === "1") {
    try {
      await write(
        c1,
        address,
        "open_case",
        [account2.address, "Disputed delivery", SPEC_URL, RUBRIC, 4102444800],
        ONE_GEN
      );
      await write(c2, address, "accept_case", ["case-3"]);
      await write(c2, address, "deliver_case", ["case-3", EVIDENCE_URL]);
      await write(c1, address, "raise_dispute", [
        "case-3",
        "The page does not contain the required content.",
      ]);
      pass("raise_dispute");

      const hash = await c1.writeContract({
        address,
        functionName: "adjudicate",
        args: ["case-3"],
      });
      const started = Date.now();
      let status = null;
      while (Date.now() - started < 20 * 60 * 1000) {
        const current = await c1.getTransaction({ hash });
        status = current?.statusName ?? current?.status ?? null;
        if (status === TransactionStatus.ACCEPTED || status === TransactionStatus.FINALIZED) {
          break;
        }
        if (status === TransactionStatus.UNDETERMINED || status === TransactionStatus.CANCELED) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 15000));
      }
      const json = JSON.parse(String(await read(c1, address, "get_case_json", ["case-3"])));
      pass(
        "adjudicate",
        `status=${status} verdict=${json.verdict} score=${json.score} criteria=${json.criteria?.length}`
      );

      await write(c1, address, "judge_rule", ["case-3", 5000, "Manual settlement after audit"]);
      const settled = JSON.parse(String(await read(c1, address, "get_case_json", ["case-3"])));
      pass("judge_rule", `${settled.status}/${settled.verdict}`);
    } catch (error) {
      fail("dispute path", String(error?.message ?? error));
    }
  } else {
    skip("real adjudication", "set RUN_ADJUDICATION=1 to run the LLM dispute path");
  }

  summary();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((error) => {
  fail("unexpected", String(error?.message ?? error));
  summary();
  process.exit(1);
});
