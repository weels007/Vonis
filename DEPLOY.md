# Deploying Vonis with the test wallets

The `wallet` repository next to this one contains two GenLayer Studio test accounts
(`tester1`, `tester2`). They are enough to deploy and exercise Vonis on **Studionet**.

## Safety first

- Those keys are **burned** (their own README says they were committed before). Use them on
  Studio/Studionet only, never on a network where GEN has value.
- Never paste a keystore or password into chat, a `VITE_*` variable, or this repository. The
  `.gitignore` here already refuses `*.password`, `*keystore*.json` and `wallet/`.
- The web app never uses these keys. A browser dApp must sign through an EIP-1193 wallet
  (MetaMask). Shipping a private key inside the frontend would expose the deployer/judge account to
  anyone who opens the page.
- Rotate both accounts before handing the project over (new keystores, new secrets, updated wallet
  repo).

## 1. Import the deployer account

Run from the root of this repository (`Vonis/`), with the `wallet` repository checked out beside it
(`../wallet`). The shell reads the password file; it is never printed.

```bash
genlayer account import \
  --name vonis-tester1 \
  --keystore ../wallet/tester1-keystore.json \
  --source-password "$(cat ../wallet/tester1.password)" \
  --password "$(cat ../wallet/tester1.password)" \
  --overwrite
```

The imported account becomes active. Confirm it:

```bash
genlayer account show
genlayer account list
```

`tester1` is the signer and becomes the contract's **judge** (the deployer address is stored as the
judge in `__init__`).

## 2. Deploy to Studionet

```bash
genlayer network set studionet
genlayer deploy --contract contracts/vonis.py
```

Studionet is the hosted development network and is gasless, so the test account normally needs no
funds. If the CLI reports an insufficient balance, fund the printed address through the Studio
faucet (the 💧 control in the Studio account selector) before retrying.

Save the deployed address; the frontend and the docs need it.

## 3. Verify the deployment

```bash
genlayer schema <address>
genlayer call <address> get_case_count
genlayer call <address> get_judge
```

Then open the case page in the frontend after setting `VITE_CONTRACT_ADDRESS=<address>`.

## 4. Use `tester2` as the provider

Import the second account the same way, then switch with `genlayer account use vonis-tester2`.
It is useful for provider-side actions (accept, submit evidence) when testing through the CLI or a
second browser wallet. For the browser flow, import the same keystore into MetaMask (add Studionet
with chain id `61999` and RPC `https://studio.genlayer.com/api`).

## 5. Smoke case

`open_case` is payable, and the CLI `write` command has no value flag, so create the first case from
the frontend (or GenLayer Studio) with a funded wallet. A happy-path smoke test:

1. import `tester1` in the browser and open a case with `tester2` as provider and a 1 GEN reward;
2. import `tester2` and accept, then submit one evidence URL;
3. switch back to `tester1` and accept the delivery (fast path, no AI cost);
4. confirm `get_case_json` shows `SETTLED`, then claim the credit with **Claim funds**.

The dispute path needs real web/LLM execution; use a public page for the specification and the
evidence, and expect the verdict to take minutes.

## Automating it later

If you want a CI deploy, do not commit the keystore. Put it and its password in GitHub Actions
secrets and decrypt it inside a small Node script using `viem`'s keystore helpers, then call
`genlayer-js` `deployContract`. That script does not exist yet; ask before adding it, because it
means giving CI the deployer key.


## If you want the key in GitHub Actions secrets

Two patterns. Pick one deliberately.

### Pattern A — secret-free CI (recommended)

The contract is immutable and deployed once, so CI does not need the deployer key at all.

1. Deploy from your machine with sections 1–2 above.
2. Store only the **public contract address**:
   - Settings → Secrets and variables → Actions → **Variables** → `VITE_CONTRACT_ADDRESS`.
   - Optionally commit it as a fallback in `src/lib/genlayer.ts` so published previews connect
     without local env files.
3. The deployer key never enters CI, so a compromised workflow cannot drain or redeploy anything.

This is the safer default: a leaked deployer key is a permanent impersonation of the judge, while a
leaked contract address is public information.

### Pattern B — CI deploy with environment protection

Use this only if you need repeatable deploys from CI.

Create an environment named `studionet` (Settings → Environments) with **required reviewers**, then
add these **secrets** to that environment (not to the whole repository):

- `VONIS_KEYSTORE_JSON` — the entire keystore JSON on one line
- `VONIS_KEYSTORE_PASSWORD` — the keystore password

Workflow outline:

```yaml
name: deploy-studionet
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: studionet
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm install
      - name: Deploy contract
        env:
          KEYSTORE_JSON: ${{ secrets.VONIS_KEYSTORE_JSON }}
          KEYSTORE_PASSWORD: ${{ secrets.VONIS_KEYSTORE_PASSWORD }}
        run: node scripts/deploy.mjs
```

`scripts/deploy.mjs` would decrypt the keystore in memory (`ethers` `Wallet.fromEncryptedJson`),
build an account with `createAccount(wallet.privateKey)`, call
`createClient({ chain: studionet, account }).deployContract({ code })`, wait for `ACCEPTED`, and
print the receipt. That script is **not committed yet**: it needs a dependency (`ethers`), and the
exact field that carries the new contract address in the receipt has to be verified against a real
deploy before it can be trusted in automation.

Cautions for Pattern B:

- **Never** run it on `pull_request`. Fork PRs cannot read secrets anyway, and a same-repo PR could
  alter the deploy script and exfiltrate the key.
- Use `workflow_dispatch` plus a protected environment with required reviewers, and restrict who can
  push to `main`.
- Do not `echo` secrets, do not enable `set -x`, write the keystore to `$RUNNER_TEMP` and delete it
  afterwards.
- The GenLayer **CLI** stores imported keys in the OS keychain (`keytar`), which is unreliable on
  headless runners; prefer the `genlayer-js` path above.
- A key that has ever been committed is burned. Rotate both test accounts before relying on this,
  and never use these accounts on a network where GEN has value.
