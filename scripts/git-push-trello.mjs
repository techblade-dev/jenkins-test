/**
 * Run `git push` with the same args; on success, post Trello comments from the
 * ref payload that pre-push stored (so Trello only runs if the network push succeeded).
 * Usage: node scripts/git-push-trello.mjs
 *   npm run git:push -- [git push options…]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { unlinkSync } from "node:fs";
import { runTrelloAfterSuccessfulPush } from "./lib/runTrelloAfterSuccessfulPush.mjs";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const pendingPath = execFileSync(
  "git",
  ["-C", root, "rev-parse", "--git-path", "trello-pending-refs"],
  { encoding: "utf8" },
).trim();
try {
  unlinkSync(pendingPath);
} catch {
  /* no prior file */
}

const pushArgs = process.argv.slice(2);
const r = spawnSync("git", ["push", ...pushArgs], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if (r.error) {
  console.error(r.error);
  process.exit(1);
}
if (r.status !== 0) {
  process.exit(r.status ?? 1);
}

process.exit(runTrelloAfterSuccessfulPush());
