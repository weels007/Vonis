/**
 * Write a freshly deployed contract address into the frontend constant.
 *
 * The Studionet workflow exports CONTRACT_ADDRESS after a successful deploy;
 * this keeps src/lib/genlayer.ts pointing at the newest contract, so a static
 * host such as Vercel follows the deployment without a manual edit.
 *
 *   CONTRACT_ADDRESS=0x... node scripts/record-address.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const PATH = "src/lib/genlayer.ts";
const LINE = /(export const CONTRACT_ADDRESS = ")0x[0-9a-fA-F]{40}(";)/;

const address = (process.env.CONTRACT_ADDRESS ?? "").trim();
if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
  console.log(`no valid CONTRACT_ADDRESS (${address || "empty"}); leaving ${PATH} alone`);
  process.exit(0);
}

const source = readFileSync(PATH, "utf8");
if (!LINE.test(source)) {
  console.error(`cannot find the CONTRACT_ADDRESS line in ${PATH}`);
  process.exit(1);
}

const next = source.replace(LINE, `$1${address}$2`);
if (next === source) {
  console.log(`${PATH} already points at ${address}`);
  process.exit(0);
}

writeFileSync(PATH, next);
console.log(`recorded ${address} in ${PATH}`);
