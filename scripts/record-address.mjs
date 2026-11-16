/**
 * Write a freshly deployed contract address into the app and the docs that quote it.
 *
 * The Studionet workflow exports CONTRACT_ADDRESS after a successful deploy; this keeps
 * src/lib/genlayer.ts, the `Live contract` line in README.md and the explorer link in
 * SUBMISSION.md pointing at the newest contract, so a static host such as Vercel follows
 * the deployment and the submitted links never go stale.
 *
 *   CONTRACT_ADDRESS=0x... node scripts/record-address.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const HEX = "0x[0-9a-fA-F]{40}";

// One target per place the current address is published, so a historical address kept
// elsewhere (steward request.md quotes the superseded deployment) is never rewritten.
const TARGETS = [
  {
    path: "src/lib/genlayer.ts",
    pattern: /(export const CONTRACT_ADDRESS = ")0x[0-9a-fA-F]{40}(";)/,
    required: true,
  },
  {
    path: "README.md",
    pattern: /(\*\*Live contract on Studionet:\*\* `)0x[0-9a-fA-F]{40}(`)/,
  },
  {
    path: "SUBMISSION.md",
    pattern: /(https:\/\/explorer-studio\.genlayer\.com\/address\/)0x[0-9a-fA-F]{40}/,
  },
];

const address = (process.env.CONTRACT_ADDRESS ?? "").trim();
if (!new RegExp("^" + HEX + "$").test(address)) {
  console.log(`no valid CONTRACT_ADDRESS (${address || "empty"}); leaving the files alone`);
  process.exit(0);
}

let failed = false;
let updated = 0;

for (const target of TARGETS) {
  let source;
  try {
    source = readFileSync(target.path, "utf8");
  } catch {
    console.log(`skip ${target.path}: file not found`);
    if (target.required) failed = true;
    continue;
  }

  if (!target.pattern.test(source)) {
    console.log(`skip ${target.path}: no address line to update`);
    if (target.required) failed = true;
    continue;
  }

  const next = source.replace(target.pattern, (match, before, after) =>
    before + address + (typeof after === "string" ? after : "")
  );

  if (next === source) {
    console.log(`${target.path} already points at ${address}`);
    continue;
  }

  try {
    writeFileSync(target.path, next);
    updated += 1;
    console.log(`recorded ${address} in ${target.path}`);
  } catch (error) {
    failed = true;
    console.error(`cannot write ${target.path}: ${error?.message ?? error}`);
  }
}

if (updated === 0) console.log(`nothing changed for ${address}`);
process.exit(failed ? 1 : 0);
