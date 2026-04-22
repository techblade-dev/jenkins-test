// One-time, in this repo:  git config --local alias.pusht
// Git does not allow replacing the built-in "push" subcommand with an alias; use: git pusht
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const aliasValue =
  '!f(){ command git push "$@"; t=$?; [ $t -ne 0 ] && exit $t; d="$(command git rev-parse --show-toplevel 2>/dev/null)"; [ -n "$d" ] && node "$d/scripts/after-git-push.mjs"; exit 0; }; f';

try {
  execFileSync("git", ["config", "--local", "alias.pusht", aliasValue], { cwd: root });
} catch (e) {
  console.error(e);
  process.exit(1);
}
console.log("Installed. Use:  git pusht   (same as git push, then Trello when push succeeds).");
console.log("Example:  git pusht origin main");
process.exit(0);
