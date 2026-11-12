# Vonis Architecture

Dispute court for autonomous agents. This document explains the contract design, the reasoning
behind each technical decision, and what must be verified before real money is involved.

## 1. Problem and positioning

Autonomous agents can pay, perform tasks and report results. What is missing is a neutral party that
decides whether delivered work meets the agreement when the two sides disagree — without handing the
decision to a centralised platform.

Vonis does one thing: **adjudication of work disputes between two agents**, using public evidence,
written criteria and economic consequences (reward, refund, stake slashing, reputation).

Out of scope: fiat payments, KYC, legal enforcement, and legal certainty of escrow.

## 2. Roles

- Requester — opens the case, escrows the reward, pins the rubric.
- Provider — performs the work, posts a stake, submits evidence.
- Judge — the address set at deploy time (the deployer). The only address allowed to `judge_rule`.
- GenLayer validators — verify the leader's result on every adjudication.

## 3. Data

All storage is flat: no nested collections inside dataclasses, which avoids serialization and
generic storage allocation issues.

- `Case` — parties, title, `spec_url`, `rubric`, `reward`, status, evidence, claim, verdict,
  `award_bps`, score, reasons, `criteria_report`, credits, slash, deadlines and timestamps.
- `Agent` — handle, endpoint, stake, active cases, statistics, reputation score (starts at 50).
- `credits[Address]` — balances that can be withdrawn (pull payments).

Cases live at `cases["case-N"]`; agents at `agents[address]` (TreeMap).

## 4. Money

Three separate pools:

- `escrow_total` — rewards of cases that have not been settled.
- `stakes_total` — agent stake still locked.
- `credits_total` — funds already owned by a party but not yet withdrawn.

Flow: `open_case` (payable) increases escrow; `_finalize` decreases escrow and increases credits;
`withdraw` zeroes the credit and sends GEN through an external message (`emit_transfer`, always
`on='finalized'`).

Why pull payments instead of paying at verdict time:

- direct mode cannot emit messages, so adjudication logic could not be tested if payment shared the
  same path;
- a failed external message must not roll back a decision that is already final;
- `withdraw` zeroes the credit before emitting, which is safe against re-entrancy.

Consequence: the winner must call `withdraw`. The frontend must show claimable balances.

## 5. State machine

```
OPEN --accept_case--> ACCEPTED --deliver_case--> DELIVERED --accept_delivery--> RULED --> SETTLED
  |                                              |
  |                                              +--raise_dispute--> DISPUTED --adjudicate--> RULED
  |                                              |                                            |
  +--cancel_case--> RULED --finalize--> SETTLED  +--(judge_rule)------------------------------+
```

Key rules:

- `accept_delivery` and `cancel_case` settle immediately (no AI cost).
- `finalize_case` requires `RULED` and a closed appeal window, unless the judge rules
  (`judge_rule`), which settles immediately.
- `UNVERIFIABLE` cannot be finalized without `judge_rule`.
- `SETTLED` is final; every other path refuses it.

## 6. Adjudication

### Non-deterministic block

The contract uses `gl.vm.run_nondet` (not `run_nondet_unsafe`) because the direct-mode test runner
patches that function; the validator already handles every error explicitly (a leader error or a
mismatched result returns `False` rather than raising).

Everything that touches the outside world lives in `leader_fn` / `validator_fn`:

1. Fetch the specification text from `spec_url` (`gl.nondet.web.get`, truncated to 6000 chars).
2. Fetch each evidence URL (up to 3), truncate, and wrap in `<<<EVIDENCE n>>>` markers.
3. Build the prompt: role, rules, case, specification, rubric (N criteria), claim, evidence.
4. `gl.nondet.exec_prompt(prompt, response_format="json")`.
5. Normalize defensively: extract the JSON object, validate the enum, clamp numbers, force exactly N
   criteria entries.

Outside the block: verdict, score, award, status, reputation, credits. No storage writes inside the
block, no contract calls, no messages.

### Output contract and normalization

```json
{
  "verdict": "PROVIDER_AT_FAULT | REQUESTER_AT_FAULT | SHARED | UNVERIFIABLE",
  "award_bps": 0,
  "score": 0,
  "criteria": [{"id": 1, "met": true, "why": "short reason"}],
  "summary": "...",
  "injection_suspected": false
}
```

`award_bps` is the provider's share of the reward, and it is the number that pays out. Normalization
snaps it onto a fixed ladder for the verdict, so two honest runs cannot disagree by a few basis points
and then store one of them as the payout:

- `PROVIDER_AT_FAULT` → 0 or 2500
- `SHARED` → 5000 or 7500
- `REQUESTER_AT_FAULT` → 9000 or 10000
- `UNVERIFIABLE` → 0 (no payout until the judge rules)
- the number of `criteria` entries always equals the number of rubric lines (pad `false`, truncate)

The prompt asks for those exact values; anything else is snapped to the nearest bucket, with a tie
going to the lower one. This is what makes the number validators compare meaningful, rather than raw
LLM output that could say "provider at fault" while awarding 100%.

### What validators compare

- `verdict` — identical.
- `award_bps` — identical (both sides normalized onto the ladder above).
- `score` — tolerance ±15 (display only; it never moves money).
- `criteria[].met` — identical per criterion, in order.
- `injection_suspected` — identical.

Not compared: `summary` and `criteria[].why` (free text always differs, and neither drives a payout or
a later decision).

These thresholds are a starting point, not dogma. Calibrate them in Studio mode with
`analyze(runs=100)` on a test rubric; target ≥95% agreement. Below 90%, fix the prompt/rubric instead
of loosening tolerance.

### Prompt injection

- Evidence is URLs only; an agent cannot paste instructions directly into the prompt.
- Evidence content is still untrusted: it is fenced, the prompt explicitly says not to follow it, and
  the output is constrained to enums and integers.
- `injection_suspected` must match across validators; when true, `adjudicate` writes `UNVERIFIABLE`
  with award 0 and an explicit reason — no automatic settlement.
- The rubric cannot be changed after the case is opened.

## 7. Settlement and slashing

- `PROVIDER_AT_FAULT` → the ladder award (0 or 2500 bps) to the provider, the rest refunded; the
  provider stake is slashed by `SLASH_BPS` (20% of the reward, capped at the stake) and credited to
  the requester.
- `REQUESTER_AT_FAULT` → 9000 or 10000 bps to the provider.
- `SHARED` → 5000 or 7500 bps to the provider.
- `UNVERIFIABLE` — the judge rules by hand. If the judge never does, either party can call
  `settle_unresolved` after `RESCUE_WINDOW` (14 days) and the reward is refunded in full, without a
  score penalty, so escrow can never stay locked forever.

`withdraw_stake` is blocked while an agent has active cases. `deposit_stake` is only for registered
agents.

Reputation: award ≥9000 → `cases_won+1`, score +5; award ≤3000 → `cases_lost+1`, score −10;
`CANCELLED` cases do not change reputation. Score is clamped to 0..100.

## 8. Limits and validation

- Title ≤ 140, `spec_url` ≤ 500 (http/https), rubric ≤ 3000 (max 8 criteria), claim ≤ 1200,
  evidence ≤ 900 characters and ≤ 3 URLs, URL ≤ 500.
- Deadlines use the transaction timestamp (`datetime.now(timezone.utc)`), not wall-clock time. A
  transaction may execute minutes after it was sent, so deadlines should not be too tight.
- `open_case` rejects `value == 0`, a provider equal to the requester, and an unregistered provider.

## 9. Testing strategy

Direct mode (in-memory, CI):

- Structural lint (`tests/test_lint.py`), no SDK: the `Depends` header exists, storage uses GenVM
  types (`TreeMap`, not `dict`), public methods do not call `gl.nondet`, `leader_fn` writes no
  storage and emits no messages, `Case` keeps the fields the frontend reads, no public method starts
  with `__` (the schema generator rejects those), and `TreeMap.get` is never called without a default.
- Registry and stake: registration, deposit, withdrawal, blocking while cases are active.
- State machine: every transition, per-role access, deadlines, invalid URLs, URL count.
- Settlement: fast path, cancel, full/partial verdicts, slashing, double finalize.
- Failure modes: HTTP 500 on the specification, unknown verdict, non-party, adjudication without a
  dispute.
- Consensus: `run_validator()` accepts/rejects on verdict, score, award, criteria, injection flag, and
  a leader error.
- Adversarial (`tests/test_adversarial.py`): instruction-bearing evidence (quarantined as
  `UNVERIFIABLE`), awards inconsistent with the verdict (clamped), markdown-fenced JSON, trailing
  commas, JSON arrays, alias/lowercase verdicts, non-numeric awards, empty/over-8 criteria,
  oversized evidence, and another party's credit.
- Integration (`tests/test_integration.py`): two full sequential cases (fast path + dispute),
  `escrow_total`/`credits_total`/`stakes_total` invariants, `SETTLED` status and the
  `get_case_json` payload.

Studio mode (later, needs localnet/Studionet):

- One full flow with real validators.
- One appeal through `judge_rule`.
- `analyze(runs=100)` to measure agreement and tune tolerances.
- `withdraw` and external messages, which direct mode cannot test.

## 10. Deployment

1. Pin the SDK runner hash on the first line of `contracts/vonis.py`: `py-genlayer:latest` resolves to
   the GenVM test runner, which nodes reject outside debug mode (`invalid_contract`).
   `scripts/runner-hash.py` prints the runner hashes a GenVM release bundle ships.
2. Run `genvm-lint check contracts/vonis.py` (part of the CLI) before deploying.
3. `genlayer network set studionet`, then `genlayer deploy --contract contracts/vonis.py`.
4. Verify the deployment before using it: read the code back at the reported address
   (`gen_getContractCode`) and call a view. A deploy whose execution failed still leaves a Ghost at
   the address, where writes succeed as no-ops, so a successful write is not proof of a contract.
5. For Bradbury: confirm chain id 4221, the faucet, and estimate write fees including
   `messageAllocations` for `withdraw`.
6. Record the address, network, commit hash and measured costs here.

The deployer becomes the judge. For production, the judge address should be a multisig/DAO rather
than a personal EOA — a deliberate MVP simplification that must change before meaningful economic
value.

## 11. Known limitations

- **Single judge** (the deployer). No multi-judge, random selection, or layered appeals.
- **No indexer**: the case list is read from `case_count` plus `get_case_*`; fine for an MVP, not for
  volume.
- **Direct mode cannot emit external messages**, so `withdraw` can only be tested in Studio. That is
  why the credit ledger is separated from emission.
- **Failed external-message value** is not automatically returned (a protocol limitation). Credits
  are zeroed before emitting and payout history is stored on-chain for manual reconciliation.
- **AI/consensus cost** is not measured yet; real estimates must come from Bradbury before pricing.
- **Small integer types** (`u8`/`u16`) are deliberately avoided; the contract uses `u256`/`i32`.
- **Event API** (`gl.chain.Event`) is not used; it must be verified before adding events.

## 12. GenLayer feature audit

Reviewed against every documented GenLayer capability, judged by whether it improves decision
quality, fund safety, or product viability.

**Already used**

- Non-deterministic block + `gl.vm.run_nondet` with a custom validator and explicit tolerances.
- Web access (`gl.nondet.web.get`) with content truncation and status handling across SDK layouts.
- Structured LLM output (`exec_prompt(..., response_format="json")`) with defensive normalization.
- Value transfers: `@gl.public.write.payable`, pull payments, external `emit_transfer`.
- Flat storage (`TreeMap` + `@allow_storage` dataclasses), sized integers (`u256`, `i32`).
- Transaction context: `sender_address`, `origin_address` (stored per case), transaction timestamp.
- `__receive__` is deliberately absent: GenVM rejects a bare value transfer when there is no receive
  handler, so value can only arrive through a payable method, and the schema generator (which fails
  on public names starting with `__`) works again.
- Direct-mode tests with `mock_web`/`mock_llm` + `run_validator`, executed in CI.

**Worth adding, in priority order**

1. **Events (`gl.chain.Event` → `gen_getLogs`)** — the highest product priority, not a logic one.
   Without events, a frontend/indexer must poll `case_count` and every `get_case_*`. Deferred because
   `emit()` syntax is not verified on the pinned SDK; verify on Studionet, then emit `CaseOpened`,
   `CaseAccepted`, `EvidenceSubmitted`, `CaseRuled`, `CaseSettled`, `Withdrawn`.
2. **`render(url, mode="text")` for evidence pages** — less HTML noise (tokens and prompt-injection
   surface). Trade-off: `render` returns no status code, so `get` stays for specifications that need
   4xx/5xx detection. Can be applied per URL.
3. **Visual evidence** — `render(url, mode="screenshot")` + `exec_prompt(..., images=[...])` (max 2
   images) for design/landing-page deliverables. A genuinely GenLayer-native capability, but
   expensive: make it an optional per-case flag and cap at one image.
4. **Vector store for precedent** — find similar cases and include a summary as context, improving
   consistency. Requires decisions on embedding cost and determinism.
5. **`run_nondet` error comparators** — today a leader error always means disagree (rotation). Two
   nodes failing transiently at the same time could legitimately agree to fail. `run_nondet` accepts
   `compare_user_errors`/`compare_vm_errors`; the API is unverified, so it is not used yet.
6. **EVM reads (ERC-8004 agent registry)** — cross-application reputation through
   `@gl.evm.contract_interface.view()`. Phase 2, once a stable registry exists.

**Deliberately not used**

- `strict_eq` for verdicts: LLM output is never identical.
- One child contract per case (`gl.deploy_contract`): deployment cost is not worth it.
- `__handle_undefined_method__`: unknown calls should fail rather than be handled silently.
- Upgradability: the contract is intentionally immutable. A repair path would be a product decision
  that adds a trust assumption (who may upgrade) and must be discussed separately.

## 13. Roadmap

- M1: frontend read/write, case pages, fee estimation, per-criterion verdict display.
- M2: Studio-mode test suite + prompt/agreement calibration.
- M3: deploy Studionet → Bradbury, measure cost and latency, document them.
- M4: cross-application reputation, agent directory, rubric templates, multi-judge.

## 14. SDK compatibility notes (verified through CI)

Direct-mode tests run with `genlayer-test==0.29.2` and `GENVM_VERSION=v0.2.16` (the fallback the tool
itself uses). SDK behaviours that differed from the initial assumptions, now handled in the contract:

- `TreeMap` has no automatic zero value. Its `get` also needs a **default argument** on the node:
  `self.agents.get(who)` raises there while direct mode tolerates it. Every storage read uses
  membership plus indexing, and `tests/test_lint.py` rejects a one-argument `.get()` so the gap cannot
  come back.
- Address arguments arrive from the client as hex strings while storage keys are `Address` values, so
  public methods taking an address normalise it with `_as_address` at the boundary.
- Web responses do not always expose `status_code`; the contract reads `status_code`/`status`/`code`
  and the body through `body`/`content`.
- Runner/SDK file names and the `genlayer.types` layout differ between the v0.2 and v0.3 lines. Pin
  the GenVM version in CI; the contract header pins the py-genlayer runner hash the node ships.
- `gl.vm.run_nondet` (not `run_nondet_unsafe`) is used because the direct-mode runner patches that
  function.

## 15. Read surface for the frontend

The contract exposes two layers: typed views for small components, and one JSON view for the case
detail card (including AI consensus output).

Reads ask for the SDK's **latest non-final snapshot** (`transactionHashVariant`), not the latest final
one. A contract that was just deployed, or a case written seconds ago, is not in the decided state
yet, and reading the final snapshot there fails with `Contract not found`. The frontend and the
Studionet script both pass `TransactionHashVariant.LATEST_NONFINAL`; reads that must be durable for
accounting can opt into the final snapshot deliberately.

**Per-field views**

- `get_case_count()`, `get_case_status()`, `get_case_verdict()`, `get_case_award_bps()`,
  `get_case_score()`, `get_case_reasons()`.
- `get_case_claim()`, `get_case_criteria()`, `get_case_judge_note()`.
- `get_case_evidence()`, `get_case_rubric()` — raw content for auditors.
- `get_case_parties()`, `get_case_origin()`, `get_case_deadlines()`, `get_case_timestamps()`
  (`submitted|adjudicated|settled`, Unix seconds).
- `get_case_payouts()` — `credit_provider|credit_requester|slashed`.
- `get_credit_of(addr)`, `get_agent_handle/score/stake/active_cases/stats`, `get_escrow_total()`,
  `get_stakes_total()`, `get_credits_total()`.

**`get_case_json(case_id)` — one call for the detail card**

Returns a JSON string with: `id`, `title`, `status`, `verdict`, `award_bps`, `score`, `reasons`,
`claim`, `criteria`, `reward`, `credit_provider`, `credit_requester`, `slashed`, `judged`,
`judge_note`, `requester`, `provider`, `origin`, `delivery_deadline`, `dispute_deadline`,
`appeal_deadline`, `submitted_ts`, `adjudicated_ts`, `settled_ts`.

`criteria` is an array of `{"id": 1, "met": true, "why": "..."}` — the part users read as "AI
consensus detail": which criteria were met, which were not, and a short reason per criterion (`why`,
max 160 chars). `reasons` is the overall summary (max 600 chars). `verdict` + `score` + `award_bps`
give the conclusion and the economic consequence. The rubric is not duplicated in this JSON (use
`get_case_rubric`) so the payload stays small.

Implementation note: `criteria_report` is stored as a JSON string during `adjudicate` (max 1200
chars) and parsed back by the view. All `u256`/`i32` values are converted to integers before
serialization so JSON is safe. If a case has no verdict yet, `criteria` is empty and `verdict` is
empty.

For the case list, the frontend still uses `get_case_count()` and then `get_case_json` per id. Events
(`gl.chain.Event`) remain the next recommendation so polling can be replaced; see section 12.

## 16. Frontend

Vite + React + TypeScript at the repository root (not a subfolder) so `index.html` and `package.json`
are detected when the app is published. There is no backend and no server state: all data comes from
contract views.

- Hash routing with separate pages: landing, case explorer, case detail, new case, transactions. Hash
  routing keeps deep links working on static hosting.
- `src/lib/genlayer.ts` — read client (no wallet) and write client (`window.ethereum`), fee estimation
  with `estimateTransactionFeesForWrite` including `messageAllocations`, then
  `waitForTransactionReceipt(ACCEPTED)` with a 3-minute timeout and a `txExecutionResultName` check so
  failed execution never looks like success.
- `src/lib/wallet.ts` — `eth_accounts` on load (no popup), a single in-flight promise for
  `eth_requestAccounts` (double clicks do not stack popups), switch/add chain, and
  `accountsChanged`/`chainChanged` listeners plus GEN balance.
- `src/lib/errors.ts` — translates wallet errors and contract revert messages into actionable
  sentences; the raw message stays in transaction history.
- `src/hooks/useTransactions.ts` — transaction queue with per-action keys, session history in
  `localStorage`, `pending/success/error` status and `errorDetail` for debugging.
- `src/components/Toast.tsx` — success/failure, explorer link, details button, auto-dismiss after 8s.
- `src/components/TxList.tsx` / `TxPanel.tsx` — transaction history: method, time, hash, status,
  error, copy hash, explorer link.
- `src/components/ConsensusPreview.tsx` — the landing-page verdict card.
- `src/components/SiteHeader.tsx` — navigation, network, contract link, wallet state and claim button.

Polling every 15 seconds replaces events. The consequence: no change history, and the case list is
capped at the 50 newest cases (`case_count` then `get_case_json` per id). Events remain the main
backlog item; once `gl.chain.Event` syntax is verified on Studionet, polling can be replaced by an
indexer.
