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
