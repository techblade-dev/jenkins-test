// Run after a successful `git push` to post Trello (same as tail of `npm run git:push`).
// Use:  git push && node scripts/after-git-push.mjs
//   or:  npm run trello:after-push
//   or:  run `npm run setup:git:pusht` once, then:  git pusht
import { runTrelloAfterSuccessfulPush } from "./lib/runTrelloAfterSuccessfulPush.mjs";

process.exit(runTrelloAfterSuccessfulPush());
