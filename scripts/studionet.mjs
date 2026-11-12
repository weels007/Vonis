/**
 * Deploy Vonis to Studionet and exercise its methods with the two test wallets.
 *
 * Credentials come from environment variables (GitHub Actions secrets); nothing
 * is written to disk. Set RUN_ADJUDICATION=1 to include the real LLM dispute
 * path, which can take several minutes.
 */
import { readFileSync, appendFileSync } from "node:fs";
import { Wallet } from "ethers";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionHashVariant, TransactionStatus } from "genlayer-js/types";
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
          (item.detail || "")
            .replace(/\|/g, "\\|")
            .slice(0, item.ok === false ? 500 : 160)
        } |`
    ),
  ];
  const deployed = results.find((item) => item.label === "deployed" && item.ok === true);
  if (deployed) {
    lines.push("", `Contract: \`${deployed.detail}\``);
  }
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
  // readContract defaults to the latest *final* snapshot, which does not
  // contain a contract or state written moments ago. Ask for the newest
  // non-final snapshot so reads right after a write (or a deployment) see it.
  return client.readContract({
    address,
    functionName,
    args,
    transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readWithRetry(client, address, functionName, args = [], attempts = 12) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await read(client, address, functionName, args);
    } catch (error) {
      lastError = error;
      await sleep(5000);
    }
  }
  throw lastError;
}

function leaderReceipt(tx) {
  return tx?.consensus_data?.leader_receipt?.[0] ?? null;
}

function leaderDetail(leader) {
  if (!leader) return "no leader receipt";
  const genvm = leader.genvm_result ?? {};
  const texts = {
    error: leader.error ?? genvm.error,
    stderr: genvm.stderr,
    stdout: genvm.stdout,
    result: typeof leader.result === "string" ? leader.result : undefined,
  };
  const parts = [];
  for (const [key, value] of Object.entries(texts)) {
    if (value === undefined || value === null) continue;
    const text = String(value).replace(/\s+/g, " ").trim();
    if (text) parts.push(`${key}=${text.slice(0, 400)}`);
  }
  if (parts.length === 0) parts.push(`keys=${Object.keys(leader).join(",")}`);
  return parts.join(" ");
}

async function wait(client, hash, label) {
  const receipt = await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
    interval: 3000,
    retries: 120,
  });
  const full = await client.getTransaction({ hash });
  const status = String(full?.statusName ?? receipt?.statusName ?? "UNKNOWN");
  const execution = String(
    full?.txExecutionResultName ?? receipt?.txExecutionResultName ?? "UNKNOWN"
  );
  const leader = leaderReceipt(full ?? receipt);
  // Newer nodes leave txExecutionResult empty; the leader vote carries it.
  const leaderExecution = String(leader?.execution_result ?? "").toUpperCase();
  if (execution === "FINISHED_WITH_RETURN" || leaderExecution === "SUCCESS") {
    return { receipt, full };
  }
  if (
    execution === "FINISHED_WITH_ERROR" ||
    leaderExecution === "ERROR" ||
    leaderExecution === "FAILURE"
  ) {
    throw new Error(
      `${label}: ${status} execution ${execution}/${leaderExecution || "?"} — ${leaderDetail(leader)}`
    );
  }
  // Neither field reports a result: let the follow-up read prove the outcome.
  log(`WARN ${label}: ${status}, execution result not reported`);
  return { receipt, full };
}

async function withFees(client, payload) {
  // Fee-charging networks expect an estimated policy with the write; Studio is
  // gasless and fails the estimate, which must not block the call.
  try {
    const estimate = await client.estimateTransactionFeesForWrite(payload);
    if (estimate?.distribution && estimate?.feeValue !== undefined) {
      return {
        ...payload,
        fees: {
          distribution: estimate.distribution,
          messageAllocations: estimate.messageAllocations,
          feeValue: estimate.feeValue,
        },
      };
    }
  } catch {
    // No fee policy on this network.
  }
  return payload;
}

async function write(client, address, functionName, args = [], value = 0n) {
  const hash = await client.writeContract(
    await withFees(client, { address, functionName, args, value })
  );
  await wait(client, hash, functionName);
  return hash;
}

async function writeExpectFailure(client, address, functionName, args = [], value = 0n) {
  try {
    const hash = await client.writeContract(
      await withFees(client, { address, functionName, args, value })
    );
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

function describeTx(tx) {
  if (!tx) return "no transaction";
  const leader = tx?.consensus_data?.leader_receipt?.[0] ?? {};
  const parts = [
    `status=${tx?.statusName ?? "?"}`,
    `execution=${tx?.txExecutionResultName ?? "?"}`,
    `leader=${leader?.execution_result ?? "?"}`,
    `from=${tx?.from_address ?? tx?.sender ?? "?"}`,
    `recipient=${tx?.recipient ?? "?"}`,
    `to_address=${tx?.to_address ?? "?"}`,
    `decoded=${tx?.txDataDecoded?.contractAddress ?? "?"}`,
  ];
  if (leader) {
    parts.push(`detail=${leaderDetail(leader).slice(0, 600)}`);
  }
  return parts.join(" ");
}

async function deployFees(client) {
  // Deployments are fee-funded on fee-charging networks; Studio is gasless and
  // fails the estimate, which must leave the deploy unfunded rather than broken.
  try {
    const estimate = await client.estimateTransactionFees({});
    if (estimate?.distribution && estimate?.feeValue !== undefined) {
      return {
        distribution: estimate.distribution,
        messageAllocations: estimate.messageAllocations,
        feeValue: estimate.feeValue,
      };
    }
  } catch {
    // No fee policy on this network.
  }
  return undefined;
}

async function fundSimulatedAccount(publicClient, address) {
  // The Studio simulator faucet takes either GEN units or wei depending on the
  // node build, so try both and keep whichever leaves a usable balance.
  for (const amount of [10, Number(parseEther("10"))]) {
    try {
      await publicClient.request({ method: "sim_fundAccount", params: [address, amount] });
    } catch (error) {
      log(`WARN sim_fundAccount failed: ${String(error?.message ?? error).slice(0, 160)}`);
      return false;
    }
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const balance = await publicClient.getBalance({ address });
      if (balance >= ONE_GEN) return true;
      await sleep(3000);
    }
  }
  return false;
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
  const c1 = clientFor(account1);

  const publicClient = createPublicClient({
    chain: studionet,
    transport: http(studionet.rpcUrls.default.http[0]),
  });

  let account2 = w2 ? createAccount(w2.privateKey) : null;
  if (!account2) {
    // Without the TESTER2 secrets the two-party lifecycle cannot run, so try a
    // throwaway provider key funded from the Studio simulator instead.
    const candidate = createAccount(generatePrivateKey());
    if (await fundSimulatedAccount(publicClient, candidate.address)) {
      account2 = candidate;
      log("note: TEST2 secrets are not configured; funded a throwaway provider wallet");
    }
  }
  const c2 = account2 ? clientFor(account2) : null;

  pass("wallets", `${account1.address}${account2 ? " + " + account2.address : " (single wallet)"}`);

  const balance = await publicClient.getBalance({ address: account1.address });
  pass("deployer balance", `${formatEther(balance)} GEN`);

  const code = readFileSync("contracts/vonis.py", "utf8");

  // Compile the contract on the node before spending a deploy on it: this
  // reports a bad Depends header or an SDK mismatch as a clear error.
  try {
    const schema = await c1.getContractSchemaForCode(code);
    const methods = Object.keys(schema?.methods ?? {});
    pass("schema (off-node)", `${methods.length} methods`);
  } catch (error) {
    log(`WARN schema (off-node): ${String(error?.message ?? error).slice(0, 300)}`);
  }

  let address = null;
  let deployHash = null;
  try {
    deployHash = await c1.deployContract({ code, fees: await deployFees(c1) });
    await wait(c1, deployHash, "deploy");
    const tx = await c1.getTransaction({ hash: deployHash });
    log(`deploy tx: ${describeTx(tx)}`);
    address = tx?.txDataDecoded?.contractAddress ?? tx?.recipient ?? tx?.to_address ?? null;
    if (!address) throw new Error("deploy receipt had no contractAddress");
    // The reported address is only the contract address if code actually lives
    // there; a failed deployment leaves nothing but a Ghost at that address.
    let codeAtAddress = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        codeAtAddress = String((await c1.getContractCode(address)) ?? "");
        if (codeAtAddress.trim()) break;
      } catch (error) {
        if (attempt === 2) throw error;
      }
      await sleep(5000);
    }
    if (!codeAtAddress.trim()) throw new Error(`no contract code at ${address}`);
    log(`contract code bytes: ${codeAtAddress.length}`);
    pass("deployed", address);
  } catch (error) {
    const failed = deployHash
      ? await c1.getTransaction({ hash: deployHash }).catch(() => null)
      : null;
    fail("deploy", `${String(error?.message ?? error)} | ${describeTx(failed)}`);
    summary();
    process.exit(1);
  }

  if (process.env.GITHUB_ENV) {
    appendFileSync(process.env.GITHUB_ENV, `CONTRACT_ADDRESS=${address}\n`);
  }

  try {
    const count = await readWithRetry(c1, address, "get_case_count");
    pass("get_case_count", String(count));
    if (Number(count) !== 0) fail("fresh contract", "case_count is not zero");
  } catch (error) {
    const failed = await c1.getTransaction({ hash: deployHash }).catch(() => null);
    fail("get_case_count", `${String(error?.message ?? error)} | ${describeTx(failed)}`);
    summary();
    process.exit(1);
  }

  try {
    const judge = await read(c1, address, "get_judge");
    pass("get_judge", String(judge));
  } catch (error) {
    fail("get_judge", String(error?.message ?? error));
  }

  // Registry: both agents register, then read their profile back. A write to an
  // address without code succeeds as a no-op, so check the stored handle.
  try {
    await write(c1, address, "register_agent", ["requester-agent", "https://example.com"]);
    const handle = String(await read(c1, address, "get_agent_handle", [account1.address]));
    if (handle !== "requester-agent") {
      throw new Error(`handle is "${handle}" after register_agent`);
    }
    pass("register_agent(requester)", handle);
  } catch (error) {
    fail("register_agent(requester)", String(error?.message ?? error));
  }

  if (c2) {
    try {
      await write(c2, address, "register_agent", ["provider-agent", "https://example.com"]);
      const handle = String(await read(c2, address, "get_agent_handle", [account2.address]));
      if (handle !== "provider-agent") {
        throw new Error(`handle is "${handle}" after register_agent`);
      }
      pass("register_agent(provider)", handle);
    } catch (error) {
      fail("register_agent(provider)", String(error?.message ?? error));
    }
  }

  try {
    const score = await read(c1, address, "get_agent_score", [account1.address]);
    pass("get_agent_score", String(score));
  } catch (error) {
    fail("get_agent_score", String(error?.message ?? error));
  }

  if (!c2) {
    skip(
      "case lifecycle",
      "second wallet unavailable: add VONIS_TESTER2_KEYSTORE / VONIS_TESTER2_PASSWORD (or CLAUSEGUARD_TESTER2_*) and sim_fundAccount did not fund a throwaway key"
    );
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
    const caseCount = Number(await read(c1, address, "get_case_count"));
    if (caseCount !== 1) throw new Error(`get_case_count is ${caseCount} after open_case`);
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
