# Steward request — lifecycle recovery for Vonis

Status: **done and deployed.** Pushed as `13ca73e`, verified by CI, deployed to Studionet by the
`studionet` workflow (job `deploy-and-test`, 8m 52s, passed), and the new address was recorded
automatically in `src/lib/genlayer.ts` by commit `90ae7a9`.

- Contract: `0x80249B8892E82984BbdcE9C1b85548f53D622ac4`
- Explorer: https://explorer-studio.genlayer.com/address/0x80249B8892E82984BbdcE9C1b85548f53D622ac4

## 1. The request, as received

> Please update the contract and app so expired OPEN and ACCEPTED cases can release escrow and
> provider activity, judge overrides cannot retain a contradictory verdict-based slash, and
> UNVERIFIABLE cases can reach the judge or 14-day rescue path through the client. Add focused tests
> for all three corrected lifecycle paths and push the changes to the submitted repository for
> verification.

Read as three defects and one delivery requirement:

1. **Stranded engagement** — `cancel_case` refuses to run once `delivery_deadline` has passed, and
   nothing else handled an `OPEN` or `ACCEPTED` case after that point. Escrow and the provider's
  `active_cases` slot stayed locked forever.
- **Contradictory settlement** — the stake slash is keyed on the stored verdict, so a judge could
  award most of the reward to the provider and still have 20% of the reward slashed out of its stake
  in the same settlement.
- **Unreachable backstops** — the contract has `judge_rule` and `settle_unresolved`, but the client
  exposed neither. An `UNVERIFIABLE` case was a dead end on screen; the 14-day rescue was only
  reachable by hand-crafted calldata.
- **Verification**: focused tests for each corrected path, pushed to the submitted repository.

## 2. Fix 1 — expired `OPEN` and `ACCEPTED` cases release escrow and the provider slot

### What was wrong

`cancel_case` is requester-only and requires `_now() <= delivery_deadline`. After that instant an
`OPEN` or `ACCEPTED` case had no exit at all: `deliver_case` rejects a late delivery, `raise_dispute`
needs a `DELIVERED` case, `adjudicate` needs `DISPUTED`, and `finalize_case` needs `RULED`. The reward
stayed in `escrow_total` and the provider's `active_cases` stayed above zero forever, which also blocks
`withdraw_stake`.

### Contract method

```python
@gl.public.write
def expire_case(self, case_id: str) -> None:
    case = self._case(case_id)

    sender = gl.message.sender_address
    _req(
        sender == case.requester or sender == case.provider or sender == self.judge,
        "not allowed to expire",
    )
    _req(case.status in (STATUS_OPEN, STATUS_ACCEPTED), "case cannot be expired")
    _req(int(_now()) > int(case.delivery_deadline), "deadline still open")

    case.status = STATUS_RULED
    case.verdict = VERDICT_EXPIRED
    case.award_bps = u256(0)
    case.reasons = "delivery deadline passed without a delivery; reward refunded"
    case.appeal_deadline = _now()
    self.cases[case_id] = case
    self._finalize(case_id, u256(0), penalize=False)
```

Technical decisions, and why:

- **Who may call it.** Requester *or* provider *or* judge. The provider needs it because the slot is
  the provider's own lock (`withdraw_stake` reverts while `active_cases > 0`); requiring the requester
  would let a silent counterparty keep the provider's stake pinned. The judge is included so a case
  can be cleared without either party cooperating.
- **Guard order.** Authority, then state, then clock. A stranger calling early gets `not allowed to
  expire`, not a hint about the deadline.
- **Strict cutoff.** `_now() > delivery_deadline` (not `>=`), mirroring `accept_case` and
  `deliver_case`, which allow `<= deadline`. No transaction can land in both windows.
- **No slash, no reputation change.** `_finalize` slashes only when
  `case.verdict == VERDICT_PROVIDER`; the new `EXPIRED` verdict never matches. `penalize=False` also
  skips the award-based reputation branch — without it, `award_bps = 0` would have counted as
  `cases_lost + 1` and `score − 10`, i.e. a loss for a provider who was never given a delivery to
  make. Expiry is a release of a contract that died, not a ruling on fault.
- **What moves.** Reused `_finalize(case_id, u256(0))`, so the accounting is the same code path every
  other settlement uses: `escrow_total -= reward`, `credit_provider = 0`,
  `credit_requester = reward`, `active_cases -= 1`, `settled_ts = now`, status `SETTLED`. No new
  arithmetic, no second payout path, `SETTLED` still closes every later call.
- **Verdict value.** `VERDICT_EXPIRED = "EXPIRED"` is a settlement verdict, deliberately *not* added to
  the `VERDICTS` tuple, which is the set of LLM outputs the validator accepts.

### Client

- `isExpired(case)` in `src/lib/format.ts` mirrors the contract rule on the local clock
  (`OPEN`/`ACCEPTED` + `delivery_deadline > 0` + now past it).
- `CaseDetail` shows **Expire and refund the requester** to the requester, the provider and the judge;
  the earlier **Cancel and refund** stays for the pre-deadline window only, so the two never appear
  together. A visitor who is none of the three sees copy naming who can act instead of a dead button.
- `statusLabel`/`verdictLabel` cover `EXPIRED`, and the landing card skips `EXPIRED`/`CANCELLED` so the
  "latest verdict" panel stays about adjudicated work.

### Tests (`tests/test_case_flow.py`)

| Test | Proves |
| --- | --- |
| `test_expire_case_refunds_an_open_case` | `OPEN` → `SETTLED/EXPIRED`, `0\|1000\|0`, escrow 0, `active_cases` 1 → 0, score unchanged at 50, `1\|0\|0` stats, a second call reverts `case cannot be expired` |
| `test_expire_case_releases_a_stuck_accepted_case` | `ACCEPTED` case: `withdraw_stake` reverts `active cases` before, succeeds after expiry, stake 0 and credit 500 |
| `test_expire_case_before_the_deadline_reverts` | `deadline still open`, escrow untouched, status still `OPEN` |
| `test_expire_case_only_by_a_party_or_the_judge` | a third party gets `not allowed to expire` and the case does not move |
| `test_the_judge_can_expire_an_abandoned_case` | the judge alone can clear it |
| `test_a_delivered_case_cannot_expire` | `DELIVERED` is out of scope, `case cannot be expired`, status unchanged |

## 3. Fix 2 — a judge override cannot keep a contradictory verdict-based slash

### What was wrong

The slash lives in `_finalize` and is keyed on the stored verdict:

```python
if case.verdict == VERDICT_PROVIDER and int(agent.stake) > 0:
    slash = min(reward * SLASH_BPS // BASIS_POINTS, stake)
    ...
    requester_cut = requester_cut + slash
```

`judge_rule` rewrote the verdict only for `UNVERIFIABLE`. So on a `PROVIDER_AT_FAULT` case a judge
could award 7000 bps — "the provider delivered most of the work" — and the settlement would pay the
provider 70% and *also* take 20% of the reward out of its stake, in the same transaction. The award and
the slash contradicted each other; the provider was paid and punished for the same delivery.

### Contract method

```python
# The largest award that is still consistent with a provider-at-fault verdict.
AWARD_PROVIDER_MAX = 2500
```

`_band_award` now uses that constant for its provider-at-fault ladder (`options = (0,
AWARD_PROVIDER_MAX)`), so the ladder and the slash boundary can never drift apart.

```python
if case.verdict == VERDICT_UNVERIFIABLE:
    case.verdict = VERDICT_JUDGED
elif case.verdict == VERDICT_PROVIDER and int(award) > AWARD_PROVIDER_MAX:
    case.verdict = VERDICT_JUDGED
self.cases[case_id] = case
self._finalize(case_id, award)
```

- **Boundary.** `award <= 2500` is exactly the provider-at-fault band, so the verdict still stands and
  the slash stays. `award > 2500` says the provider earned more than that band allows, so the ruling
  becomes a manual one (`JUDGED`) and the verdict-based slash no longer applies.
- **Invariants kept.** `judged = True`, `judge_note` stored, status `RULED`, settlement immediate, the
  judge's number is the one that pays out. Only the slash attachment changes.
- **No tolerant comparison.** Nothing is "close enough": the rule compares against the same constant
  the ladder uses, so a future change to the band updates both.

| Judge award on a `PROVIDER_AT_FAULT` case | Verdict after ruling | Slash | Payout with `reward = 1000`, `stake = 1000` |
| --- | --- | --- | --- |
| 0 – 2500 | `PROVIDER_AT_FAULT` | 20% of reward, capped at stake | e.g. 2500: `250 \| 950 \| 200` |
| 2501 – 10000 | `JUDGED` | none | e.g. 7000: `700 \| 300 \| 0` |

### Tests (`tests/test_adjudication.py`)

| Test | Proves |
| --- | --- |
| `test_judge_override_above_the_fault_band_leaves_no_slash` | award 7000 → `SETTLED/JUDGED`, `700\|300\|0`, stake still 1000, `stakes_total` 1000, note stored |
| `test_judge_override_inside_the_fault_band_keeps_the_slash` | award 2500 → verdict stays `PROVIDER_AT_FAULT`, `250\|950\|200`, stake 800 |
| `test_the_judge_can_still_rule_after_the_rescue_window` | a late `judge_rule` on an `UNVERIFIABLE` case settles it (`600\|400\|0`) instead of being blocked by the rescue path |

### Client

The judge-only ruling form warns: awarding more than 25% replaces a provider-at-fault verdict instead
of slashing the stake on top of the payout — the rule is visible where the number is entered.

## 4. Fix 3 — `UNVERIFIABLE` reaches the judge, or the 14-day rescue, through the client

### What was wrong

The contract was already complete:

- `finalize_case` refuses `UNVERIFIABLE` unless `case.judged` (`judge decision required`);
- `judge_rule` (judge only) can rule it, before or after any deadline;
- `settle_unresolved` lets either party refund it once `_now() >= adjudicated_ts + RESCUE_WINDOW`
  (14 days), and refuses once the judge has ruled.

The client had no control for either: an `UNVERIFIABLE` case rendered a verdict card and then nothing
actionable, so the only way to reach either backstop was external tooling. That is what the steward
asked to fix — not the contract.

### Client method

New helpers in `src/lib/format.ts`:

```ts
const RESCUE_WINDOW = 14 * 24 * 3600;          // mirrors the contract constant

export function rescueUnlocksAt(c: CaseView): number {
  return c.adjudicated_ts + RESCUE_WINDOW;
}
export function isAwaitingJudge(c: CaseView): boolean {
  return c.status === "RULED" && c.verdict === "UNVERIFIABLE" && !c.judged;
}
export function canRescueCase(c: CaseView): boolean {
  return isAwaitingJudge(c) && nowSeconds() >= rescueUnlocksAt(c);
}
export function isReviewable(c: CaseView): boolean {
  return c.status === "RULED" || c.status === "DISPUTED";
}
```

`CaseDetail.tsx` then renders, role-aware:

- **Waiting-on-judge copy** for `UNVERIFIABLE` cases: what the AI could not decide and the exact date
  the rescue unlocks, so a party knows the money is not lost and is not stuck either.
- **Judge ruling** form (judge only, `RULED` or `DISPUTED`): provider share in percent (converted to
  bps with the 0–100 check, integer basis points), a required note (≤ 1200 chars), one button that
  calls `judge_rule`. A `null` award cannot be submitted; the handler re-checks before sending.
- **Release the escrow (14-day rescue)** (requester or provider, `UNVERIFIABLE`, not judged, window
  passed): calls `settle_unresolved`.
- The action bar becomes visible when only these controls apply, and `CaseDetail` is now keyed by case
  id, so a half-typed ruling cannot follow the user to another case.

### Tests

Contract coverage already existed for the rescue window (`test_unresolved_case_refunds_after_the_rescue_window`,
`test_only_a_party_can_rescue_an_unresolved_case`, `test_a_judged_case_cannot_be_rescued`); this change
adds `test_the_judge_can_still_rule_after_the_rescue_window` for the judge-after-window direction, and
the UI predicates are the same rules expressed once in `format.ts`.

## 5. Was the contract deployed and tested with the real wallets?

**Yes — deployed with the change, and the affected methods were driven on Studionet by the project's
two test wallets.** Evidence:

| Item | Value |
| --- | --- |
| Commit pushed | `13ca73e` (CI + live markers `[studionet] [expiry]`) |
| CI `contracts` | passed, 32s (93 pytest tests) |
| CI `app` | passed, 25s (`tsc --noEmit` + Vite build) |
| Vercel | passed, deployment completed |
| Live `deploy-and-test` | passed, 8m 52s (deploy, code check at address, full lifecycle, expiry wait) |
| Address recording | automatic commit `90ae7a9` → `0x80249B8892E82984BbdcE9C1b85548f53D622ac4` |
| Signing wallets | `0xE8b3e800d08727D25156a44cD1609F793bd0Af5a` (TEST1) + `0x0C0Fd005478Cef9219451BBD19Dfc6C0586fC1Ad` (TEST2), both reported as `(secret)` by the script |

Log lines from that run, quoted:

```
credentials present: TEST1_KEYSTORE=yes, TEST1_PASSWORD=yes, TEST2_KEYSTORE=yes, TEST2_PASSWORD=yes
PASS wallets — 0xE8b3e800d08727D25156a44cD1609F793bd0Af5a (secret) + 0x0C0Fd005478Cef9219451BBD19Dfc6C0586fC1Ad (secret)
PASS deployer balance — 99816.4479989999999942 GEN
PASS get_judge — 0xE8b3e800d08727D25156a44cD1609F793bd0Af5a
PASS expire_case setup — case-3 ACCEPTED, deadline in 240s
PASS expire_case — SETTLED/EXPIRED refund=1000000000000000000
```

The two wallets are what makes the live run meaningful: the requester/`tester1` opens and funds cases,
the provider/`tester2` accepts and delivers, and the adversarial checks (a non-judge calling
`judge_rule`, oversized evidence) are signed by the wrong wallet on purpose, so the contract's
rejections are real rejections and not direct-mode mocks.

### Live method coverage

| Method | Live on Studionet | Notes |
| --- | --- | --- |
| `register_agent` | yes | both wallets registered |
| `deposit_stake` | yes | both wallets, 0.2 GEN each |
| `open_case` | yes | cases 0, 1, 2 and the expiry case |
| `accept_case` | yes | |
| `deliver_case` | yes | valid evidence accepted; oversized evidence rejected (expected failure) |
| `accept_delivery` | yes | case 0 → `SETTLED/ACCEPTED` |
| `raise_dispute` | yes (earlier run) | adjudication path, `RUN_ADJUDICATION=1`; not repeated in the expiry run to stay inside the request budget |
| `adjudicate` | yes (earlier run) | real web + LLM consensus run, verdict stored |
| `judge_rule` | partial | the judge-only rejection is checked in every run (`only judge`); the accepted ruling runs on the adjudication path (`RUN_ADJUDICATION=1`), which the 13ca73e run skipped |
| `finalize_case` | no (by design) | needs a closed 24-hour appeal window or a judge ruling; see gap below |
| `cancel_case` | yes | case 1 → `SETTLED/CANCELLED` |
| `withdraw` | yes | provider credit read back as 0 after the transfer |
| `withdraw_stake` | no (by design) | not in the live script; covered in direct mode |
| `settle_unresolved` | no (by design) | needs 14 days after adjudication |
| `expire_case` | **yes, this run** | case 3 → `SETTLED/EXPIRED`, refund credited, provider slot freed |
| `get_case_count`, `get_case_json`, `get_judge`, `get_credit_of`, `get_agent_handle`, `get_agent_score`, `get_agent_stake` | yes | every read the client uses is read back live |

Live result of the new path: case `case-3` on the deployed contract is `SETTLED/EXPIRED` — an
`ACCEPTED` case opened with a four-minute deadline, accepted by the provider wallet, waited out, then
expired by the provider wallet, with `credit_requester` equal to the full reward.

The live script also attempts the two branches that need an AI verdict. The dispute case now uses a
rubric the evidence plainly fails, the provider deposits a 0.2 GEN stake, and after adjudication the
judge rules 5000 bps — above the provider-at-fault band on purpose. If the AI returned
`PROVIDER_AT_FAULT`, the run asserts `JUDGED`, `slashed = 0` and the stake intact; if it returned
`UNVERIFIABLE`, it asserts the judge ruling settled the case. Any other verdict produces a skip naming
the actual verdict, so a run never pretends to have proven a branch it did not reach.

### Gaps, stated honestly

Three calls cannot be exercised inside one CI run without waiting out real windows, so they are covered
by the direct-mode suite rather than live:

- `finalize_case` — requires `RULED` plus a closed 24-hour appeal window (or a judge ruling, which
  settles immediately). Covered by `test_requester_at_fault_credits_provider`,
  `test_double_finalize_reverts`, `test_unverifiable_requires_judge_decision`.
- `settle_unresolved` — requires 14 days since `adjudicated_ts`. Covered by the three rescue tests.
- `withdraw_stake` — reachable live, but the script only deposits. Covered by
  `test_deposit_and_withdraw_stake`, `test_withdraw_stake_blocked_while_agent_has_active_case`, and
  `test_expire_case_releases_a_stuck_accepted_case`, which asserts the block-then-release sequence.

If a fully live sweep of those three is wanted, `withdraw_stake` can be added to
`scripts/studionet.mjs` cheaply (deposit 0.2 GEN, then withdraw part of it while no case is active);
the other two need a 24-hour and a 14-day wait and are better left to the deterministic suite.

## 6. Test inventory added by this request

| File | Added |
| --- | --- |
| `tests/test_case_flow.py` | 6 tests for `expire_case` (see table in section 2) |
| `tests/test_adjudication.py` | 3 tests (two judge-override boundaries, judge-after-rescue-window) |
| suite total | 84 → 93, all green in CI |

## 7. Files changed

- `contracts/vonis.py` — `expire_case`, `VERDICT_EXPIRED`, `AWARD_PROVIDER_MAX`, `judge_rule` verdict
  correction, `_band_award` using the shared constant.
- `src/lib/format.ts` — expiry/rescue/judge predicates, `EXPIRED` labels.
- `src/components/CaseDetail.tsx` — expire button, rescue button, judge ruling form, waiting-on-judge
  copy.
- `src/pages/CaseDetailPage.tsx` — keyed by case id so form state resets per case.
- `src/App.tsx`, `src/pages/Landing.tsx` — landing card skips `EXPIRED`/`CANCELLED`; test count.
- `tests/test_case_flow.py`, `tests/test_adjudication.py` — the focused tests above.
- `scripts/studionet.mjs` — opt-in live `expire_case` check.
- `.github/workflows/studionet.yml` — `run_expiry` input, `RUN_EXPIRY` wiring, address recording runs
  even when an optional check fails.
- `README.md`, `DEPLOY.md`, `docs/ARCHITECTURE.md`, `SUBMISSION.md` — lifecycle, invariants and the
  live-check story.

## 8. How to re-verify

Deterministic suite (also what CI runs):

```bash
python -m pip install "genlayer-test==0.29.2" "pytest>=8"
export GENVM_VERSION=v0.2.16
pytest -q
```

Frontend:

```bash
npm install
npm run build     # tsc --noEmit + vite build
```

Live, with the test wallets:

```bash
TEST1_KEYSTORE=... TEST1_PASSWORD=... TEST2_KEYSTORE=... TEST2_PASSWORD=... \
RUN_EXPIRY=1 node scripts/studionet.mjs
```

or from GitHub: run the `studionet` workflow with `run_expiry` ticked (and `run_adjudication` if the
LLM path is wanted). The job summary prints the result table, the contract address and the
`expire_case` outcome.

In the app, after connecting a wallet: a case past its deadline shows **Expire and refund the
requester**; an `UNVERIFIABLE` case explains that it is waiting on the judge, the judge wallet gets the
**Judge ruling** form, and after 14 days either party gets **Release the escrow**.

## 9. Known limitations

- Studionet state is temporary; the deployed address above is valid while the node keeps its state. A
  new run deploys a new contract and records its address automatically.
- `settle_unresolved` and `finalize_case` have no live coverage for the reasons in section 5.
- The two failing transactions in the explorer (non-judge `judge_rule`, oversized `deliver_case`) are
  intentional adversarial checks, not defects.
