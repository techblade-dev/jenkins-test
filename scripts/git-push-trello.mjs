/**
 * Run `git push` with the same args; on success, post Trello comments from the
 * ref payload that pre-push stored (so Trello only runs if the network push succeeded).
 * Usage: node scripts/git-push-trello.mjs
 *   npm run git:push -- [git push options…]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

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

const pending = execFileSync(
  "git",
  ["-C", root, "rev-parse", "--git-path", "trello-pending-refs"],
  { encoding: "utf8" },
).trim();

if (!existsSync(pending)) {
  process.exit(0);
}
const raw = readFileSync(pending, "utf8");
if (!raw.trim()) {
  process.exit(0);
}

const trello = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "trello-post-push-comments.mjs",
);
const t = spawnSync(process.execPath, [trello, pending], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
process.exit(t.status ?? 0);
