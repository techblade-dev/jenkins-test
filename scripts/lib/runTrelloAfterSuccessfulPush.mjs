import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function repoRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
}

/** @returns {number} exit code for the trello step (0 if skipped) */
export function runTrelloAfterSuccessfulPush() {
  const root = repoRoot();
  const pending = execFileSync(
    "git",
    ["-C", root, "rev-parse", "--git-path", "trello-pending-refs"],
    { encoding: "utf8" },
  ).trim();
  if (!existsSync(pending)) {
    if (process.env.TRELLO_DEBUG === "1") {
      console.warn(
        "[trello] No trello-pending-refs (pre-push skipped or not this repo).",
      );
    }
    return 0;
  }
  const raw = readFileSync(pending, "utf8");
  if (!raw.trim()) {
    return 0;
  }
  const trello = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "trello-post-push-comments.mjs",
  );
  const t = spawnSync(process.execPath, [trello, pending], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  return t.status ?? 0;
}
