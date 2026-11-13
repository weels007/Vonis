# Vonis

On-chain dispute court for autonomous agents, built as a GenLayer Intelligent Contract.

Two agents agree on work (requester and provider). The provider submits evidence as URLs. If the
requester rejects the delivery, a dispute opens and a **verdict** is produced by an LLM that judges
the evidence against the acceptance rubric — then **independently re-verified by GenLayer
validators**. Only deterministic code moves money.

Status: contract foundation + test suite (Milestone 0–1). 84 tests pass in GitHub Actions
(unit, structural lint, consensus, integration, adversarial, runner smoke), and the Studionet
workflow deploys the contract and drives the full case lifecycle against real validators.

## Why GenLayer

"Does this delivered work meet the agreement" cannot be reduced to on-chain data. A conventional
smart contract can execute rules; this decision needs to read language and public evidence. GenLayer
provides three things an oracle or a centralised backend cannot:

- the contract fetches evidence itself (`gl.nondet.web.get`) with no intermediary;
- qualitative judgment runs in an LLM inside a non-deterministic block;
- the result is accepted through validator consensus (the Equivalence Principle) and can be appealed.

## Case lifecycle

- `open_case` (payable) — the requester locks the reward and pins the provider, specification URL,
  acceptance rubric (one criterion per line) and delivery deadline.
- `accept_case` — the provider accepts the assignment.
- `deliver_case` — the provider submits evidence (up to 3 URLs, newline separated).
- `accept_delivery` — fast path: the requester accepts, the reward is released in full with no AI cost.
- `raise_dispute` — the requester (within a 3-day window) or the provider (so a case cannot hang).
- `adjudicate` — non-deterministic block: fetch specification and evidence, request a structured
  verdict, validators re-run the task and compare the decision fields.
- `finalize_case` — after the 24-hour appeal window, funds are credited according to `award_bps`.
- `judge_rule` — the judge (deployer address) can rule manually, including for `UNVERIFIABLE` cases
  or prompt-injection flags.
- `settle_unresolved` — if the judge never rules an `UNVERIFIABLE` case, either party can unwind the
  escrow (full refund) once the 14-day rescue window has passed, so funds cannot stay locked.
- `withdraw` — each party pulls its own credit (pull payment).

Status: `OPEN → ACCEPTED → DELIVERED → DISPUTED → RULED → SETTLED`, plus `CANCELLED` through
`cancel_case` before delivery.

## Repository layout

- `contracts/vonis.py` — Intelligent Contract (storage, state machine, adjudication, settlement).
- `tests/` — pytest direct mode: registry, state machine, adjudication, validator consensus.
- `index.html`, `src/` — Vite + React frontend (landing page, case explorer, case pages, new case,
  transaction history).
- `docs/ARCHITECTURE.md` — design, invariants, consensus strategy, security, deployment, roadmap.
- `.github/workflows/ci.yml` — contract tests plus frontend type-check and build.

## Running the tests

Requires Python 3.12+.

```bash
python -m pip install "genlayer-test==0.29.2" "pytest>=8"
export GENVM_VERSION=v0.2.16   # SDK version compatible with genlayer-test 0.29.2
pytest -q
```

Alternative: `python -m pip install -e ".[dev]"` (dev extra in `pyproject.toml`).

Direct mode runs in memory (milliseconds) with no Docker or network. Web and LLM calls are mocked
with `direct_vm.mock_web()` and `direct_vm.mock_llm()`. On the first run, `genlayer-test` downloads
the SDK matching the contract's `Depends` header (internet required).

`withdraw` is intentionally not exercised in direct mode because that mode cannot emit external
messages; the Studionet workflow covers it live (a provider withdraws its credit and the credit is
read back as zero). What direct mode tests here is the credit ledger and all settlement arithmetic.

Test layers:

- `tests/test_lint.py` — structural contract lint (no SDK): storage types, `gl.nondet` only in the
  non-deterministic block, `leader_fn` without side effects, `Case` fields the frontend reads.
- `tests/test_adversarial.py` — instruction-bearing evidence, inconsistent awards, malformed and
  fenced JSON, verdict aliases, empty/excess criteria, oversized evidence, other parties' credits.
- `tests/test_integration.py` — two full sequential cases and accounting invariants.

## Frontend

```bash
npm install
npm run dev
```

The contract address is hard-set in `src/lib/genlayer.ts` (`CONTRACT_ADDRESS`), not read from the
environment. The `studionet` workflow rewrites that line after every deployment and commits it, so it
always follows the newest contract. There is no mock data in the app: every case, verdict and
per-criterion reason on screen is read from `get_case_json`, and an unreachable contract shows an
error plus an empty state. It refreshes every 15 seconds.

Pages (hash routing, so deep links work on static hosting): landing, case explorer, case detail, new
case, and transaction history.

Features: case list, AI verdict detail (verdict, score, award, criteria + reasons), role-aware
actions (accept, submit evidence, accept delivery, raise dispute, request verdict, settle, cancel),
opening a case with a GEN reward, and claiming funds.

Transaction layer:

- Wallet connect uses `eth_accounts` on load (no popup) and `eth_requestAccounts` only on click; a
  single in-flight promise is shared so a double click cannot stack two popups.
- A wallet on the wrong network is offered a switch (`wallet_switchEthereumChain`, falling back to
  `wallet_addEthereumChain`).
- Every action has a key (`accept:case-0`, `deliver:case-0`, …) and is locked while pending, so a
  button cannot submit twice.
- Toasts distinguish success and failure, raw errors are translated into actionable messages, and
  success links to transaction details.
- The Transactions page keeps the session history (hash, method, status, error, explorer link, copy
  hash).
- Destructive actions (cancel case) use two-step confirmation; the create form resets on success.

## Deployment

```bash
genlayer network set studionet
genlayer deploy --contract contracts/vonis.py
```

The deployer address becomes the judge. The frontend hard-sets the contract address in
`CONTRACT_ADDRESS` (`src/lib/genlayer.ts`); it currently holds the latest Studionet run, so it may
stop existing when the node resets.

The contract's `Depends` header pins a concrete `py-genlayer` runner hash, matching the GenVM
release the node runs. `py-genlayer:latest` is not deployable: it resolves to the GenVM test runner,
which nodes reject outside debug mode (`invalid_contract`), so direct-mode tests can use it while a
Studionet deploy cannot. `scripts/runner-hash.py` prints the runner hashes a GenVM release ships.

Studionet is the testnet this project uses, so the public demo needs nothing else. Only if a
persistent network is ever needed (Bradbury, chain id 4221), prepare a funded wallet and estimate
write fees including `messageAllocations` for `withdraw` (see the GenLayer v0.6 fee documentation).

For a step-by-step deploy with the project's Studio test wallets (keystore import, schema check,
smoke case), see [DEPLOY.md](DEPLOY.md).

### Vercel (static hosting)

The frontend is a plain Vite build with hash routing, so it deploys as a static site:

- Root directory: `./`
- Framework preset: Vite
- Build command: `npm run build` (runs `tsc --noEmit` first)
- Output directory: `dist`
- Environment variables: none required; `VITE_NETWORK` defaults to `studionet`

No rewrites are needed: every page lives behind `#/`, so deep links resolve to the same `index.html`.
The wallet needs Studionet (chain id `61999`) in MetaMask, which the connect button offers to add.
Remember the hard-set address is a Studionet deployment: the workflow records the newest one in
`CONTRACT_ADDRESS` and commits it, so a connected Vercel project rebuilds on its own. If the node
resets before a new run, re-run the workflow or edit that one line.

Automated deploy: `.github/workflows/studionet.yml` runs `scripts/studionet.mjs`, which deploys,
checks that code really exists at the reported address (a failed deploy otherwise leaves only a
Ghost where writes succeed as no-ops), and then exercises the full case lifecycle on Studionet. It
runs on `workflow_dispatch`, or on a push touching `contracts/`, `scripts/` or `tests/` whose commit
message carries `[studionet]` (add `[adjudication]` to also run the real LLM dispute path). Every
receipt poll waits 10 seconds, which keeps the run inside Studionet's request budget. After a
successful run it writes the new address into `CONTRACT_ADDRESS` and commits that, so static hosts
follow the deployment; the commit touches only `src/`, so it never starts another live run.

## Security properties enforced by tests

- A reward cannot be paid twice: `SETTLED` closes every payout path.
- `UNVERIFIABLE` verdicts and `injection_suspected` flags never auto-settle; they require the judge.
- `withdraw` only sends the caller's credit and zeroes it before emitting (anti re-entrancy).
- Validators reject a leader whose verdict differs, whose award differs by a single basis point, whose
  score deviates by more than 15, whose criteria differ, or whose injection flag differs.
- The payout is bound exactly: the model's award is snapped to a fixed ladder for its verdict (0 or
  2500 at provider fault, 5000 or 7500 shared, 9000 or 10000 at requester fault), so validators agree
  on the same stored number that pays out.
- An `UNVERIFIABLE` case the judge never rules can be refunded by either party after 14 days
  (`settle_unresolved`); no path leaves the reward locked forever.
- The contract defines no `__receive__` handler: GenVM rejects a bare value transfer, and nothing can
  enter except through `open_case` (escrow) or `deposit_stake`.
- Evidence is limited to 3 URLs, bounded length, http/https only.
- Two calls in every live run are **supposed to fail**, and the explorer shows them as errors: a
  `judge_rule` signed by the non-judge wallet (rejected with `only judge`) and a `deliver_case` whose
  evidence exceeds the 900-character limit (rejected with `bad evidence`). The script asserts the
  case state did not change afterwards, so a rejected transaction is the expected outcome, not a bug.

## Not built yet

- Contract events (`gl.chain.Event` + `gen_getLogs`) so an indexer does not have to poll; the
  `emit()` API is not verified on the pinned SDK and direct mode cannot emit messages.
- The real LLM dispute path (`adjudicate` with web access) is behind `RUN_ADJUDICATION=1`: tick the
  input on a manual run, or add `[adjudication]` to the commit message. It is not part of the default
  run because it takes minutes.
- Multi-judge/DAO, a protocol-appeal UI, and cross-application reputation.
