# Vonis — submission

Copy-ready text for the project submission form. Keep the character limits in mind; the counts below
are approximate and fit the maximums noted next to each field.

## Project summary

**One-liner (153/180)**

> Vonis is an on-chain dispute court where autonomous agents escrow work, submit evidence, and an AI
> jury verified by GenLayer validators decides who gets paid.

## Project overview

**Description (about 830/1000)**

> Vonis is a dispute court for agents that hire each other. The requester escrows a reward together
> with a specification URL, an acceptance rubric and a delivery deadline. The provider accepts and
> submits evidence as URLs. The contract fetches those pages itself inside a non-deterministic block,
> an LLM judges every criterion, and GenLayer validators independently re-run the task and must agree
> on the verdict, each criterion result, the score and the exact payout. Only deterministic code moves
> money: the verdict maps to a fixed award ladder, a 24-hour appeal window follows, a judge backstop
> covers unverifiable cases, and a 14-day rescue path refunds escrow so funds can never stay locked.
> The site is fully on-chain: every case, verdict and per-criterion reason is read from the contract.

## Demo video (optional)

Field: link to a YouTube video or an X post (direct post link, not a profile).

If you record one, a 40–60 second screen capture is enough:

1. Landing page, then **Connect wallet** (MetaMask offers to add GenLayer Studionet, chain id 61999).
2. **New case** → register the provider wallet under *Your agent profile*.
3. Escrow a case with a reward, rubric and deadline.
4. Provider accepts, submits one evidence URL, requester accepts the delivery.
5. The case flips to `SETTLED/ACCEPTED` and **Claim** appears in the header.

## How-to

**Step 1 — Open the court**

> Open the production URL, click **Connect wallet** and approve MetaMask. The app offers to add the
> GenLayer Studionet network (chain id 61999); accept it.

**Step 2 — Register the provider wallet**

> Switch MetaMask to the wallet that will do the work, open **New case**, and under *Your agent
> profile* enter a handle (endpoint optional) and click **Register this wallet as an agent**. A case
> can only name a registered provider.

**Step 3 — Escrow the work**

> Switch back to the requester wallet. On **New case** fill in the provider address (the wallet from
> step 2), a title, a public specification URL (for example `https://example.com`), a rubric with one
> criterion per line (max 8), a delivery deadline and a reward in GEN, then click **Escrow reward and
> open case** and confirm in MetaMask.

**Step 4 — Deliver, then close the case**

> With the provider wallet, open the case, click **Accept assignment**, paste up to three evidence URLs
> (for example `https://example.com`) and click **Submit evidence**. With the requester wallet, either
> click **Accept deliverable** for the fast path (full reward), or click **Raise dispute** with a
> reason and then **Request AI verdict**.

**Step 5 — Claim the funds**

> Each side clicks **Claim** in the header to withdraw its credit.

## Review verification

**Expected verification outcome (about 470/500)**

> Fast path: the case becomes `SETTLED/ACCEPTED`, the full reward becomes the provider's credit and a
> **Claim** button appears in the header. Dispute path: after **Request AI verdict** the case becomes
> `RULED` with an AI consensus card holding the verdict (for example `REQUESTER_AT_FAULT`), the score,
> the award, and one met/not-met reason per rubric criterion; the `adjudicate` transaction is visible
> in the explorer. The linked contract already holds three cases from the CI run: case-0
> `SETTLED/ACCEPTED`, case-1 `SETTLED/CANCELLED`, and case-2 `ACCEPTED` after an oversized-evidence
> attempt was rejected.

**Contract link**

https://explorer-studio.genlayer.com/address/0xf0ab9e999D376C13c147341e0d11c0e15426Bc39

That address is kept in `src/lib/genlayer.ts` (`CONTRACT_ADDRESS`) and rewritten by the `studionet`
workflow after every deployment, so the app always points at the newest contract.

### Notes for stewards

- Two transactions in the explorer are **meant to fail**: `judge_rule` sent by the non-judge wallet
  (rejected with `only judge`) and `deliver_case` with evidence above the 900-character limit
  (rejected with `bad evidence`). Both are adversarial checks; the suite asserts the case did not
  move afterwards.
- Studionet keeps state temporarily. If the link 404s at review time, run the `studionet` workflow
  once (`workflow_dispatch`, or a push tagged `[studionet]`); it deploys a fresh contract, records the
  new address in the frontend and commits it, and the step summary prints the address to paste here.
- The judge for deploys is the deploying wallet (`VONIS_TESTER1_KEYSTORE`); the frontend reads
  `get_judge` and only shows *Request AI verdict* to the requester, the provider or the judge.
