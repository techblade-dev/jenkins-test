# Optional: get a *literal* "git push" that runs Trello after success.
# 1) Point REPO to this repo's absolute path.
# 2) In ~/.bashrc (Git Bash) add:  source /path/to/this-file
#
# This wraps `git` so only `git push` gains the extra step. Remove the source line to undo.
# export REPO="/c/Users/you/Desktop/jenkins-test"
# source "$REPO/scripts/optional-bash-override.bash"

if [ -z "${REPO:-}" ] || [ ! -d "$REPO" ]; then
  echo "Set REPO to your jenkins-test clone before sourcing optional-bash-override.bash" >&2
  return 1 2>/dev/null || exit 1
fi

git() {
  if [ "$1" = "push" ]; then
    shift
    if command git push "$@"; then
      (cd "$REPO" && node scripts/after-git-push.mjs) || true
    else
      return $?
    fi
  else
    command git "$@"
  fi
}
