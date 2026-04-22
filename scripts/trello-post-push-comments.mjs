// Reads the ref list saved by pre-push (file path arg from git-push-trello, or stdin);
// for each matching branch, posts commit links to Trello. Short id in message = commit-msg format.
// Prefer `npm run git:push` so this runs only after a successful `git push` to the network.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { loadDotenv, repoRoot } from "./lib/dotenv.mjs";

const SUBJECT = /^([a-zA-Z0-9]{7,8}) - (.+)$/;

function git(args) {
  return execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
  }).trim();
}

function remoteWebBase() {
  const o = process.env.TRELLO_COMMIT_BASE_URL;
  if (o) return o.replace(/\/$/, "");
  let url;
  try {
    url = git(["config", "--get", "remote.origin.url"]);
  } catch {
    return null;
  }
  url = url.trim();
  if (url.startsWith("git@github.com:")) {
    const rest = url.slice("git@github.com:".length).replace(/\.git$/, "");
    return `https://github.com/${rest}`;
  }
  if (url.startsWith("https://github.com/")) {
    return url.replace(/\.git$/, "");
  }
  if (url.startsWith("https://") || url.startsWith("http://")) {
    return url.replace(/\.git$/, "");
  }
  if (url.startsWith("git@")) {
    const m = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (m) return `https://${m[1]}/${m[2]}`;
  }
  return null;
}

function listCommitsForPush(localSha, remoteSha) {
  if (!remoteSha || /^0{40}$/.test(remoteSha)) {
    return git(["rev-list", "--reverse", localSha])
      .split("\n")
      .filter(Boolean);
  }
  return git(["rev-list", "--reverse", `${remoteSha}..${localSha}`])
    .split("\n")
    .filter(Boolean);
}

function firstLineOfCommit(sha) {
  return git(["show", "-s", "--format=%B", sha]).split("\n")[0]?.trim() ?? "";
}

function parsePushLines(data) {
  const lines = data.split("\n").filter((l) => l.trim().length);
  const out = [];
  for (const line of lines) {
    const parts = line
      .trim()
      .split(/\s+/)
      .map((p) => p.replace(/\r/g, "").trim());
    if (parts.length < 4) continue;
    const [localRef, localSha, remoteRef, remoteSha] = parts;
    out.push({ localRef, localSha, remoteRef, remoteSha });
  }
  return out;
}

function refIsBranch(name) {
  return name && name.startsWith("refs/heads/");
}

function branchNameFromRef(ref) {
  return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
}

function shouldPostForBranch(branches, remoteRef) {
  const set = new Set(
    branches
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean),
  );
  if (refIsBranch(remoteRef)) {
    return set.has(branchNameFromRef(remoteRef));
  }
  const m = remoteRef && remoteRef.match(/^refs\/remotes\/[^/]+\/(.+)$/);
  if (m) {
    return set.has(m[1]);
  }
  return false;
}

/** Walk board cards (same as commit validation) when direct GET /cards/{short} returns 404. */
async function findCardIdOnBoards(key, token, shortLinkNorm) {
  const boardsRaw = (process.env.TRELLO_BOARD_ID || "").trim();
  if (!boardsRaw) {
    return null;
  }
  const want = shortLinkNorm.toLowerCase();
  for (const bid of boardsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    let before = undefined;
    for (;;) {
      const u = new URL(
        `https://api.trello.com/1/boards/${encodeURIComponent(bid)}/cards`,
      );
      u.searchParams.set("key", key);
      u.searchParams.set("token", token);
      u.searchParams.set("fields", "id,shortLink");
      u.searchParams.set("filter", "all");
      u.searchParams.set("limit", "1000");
      if (before) u.searchParams.set("before", before);
      const res = await fetch(u);
      const body = await res.text();
      if (!res.ok) {
        dbg("board cards", bid, res.status, body.slice(0, 120));
        break;
      }
      const cards = JSON.parse(body);
      if (!Array.isArray(cards) || cards.length === 0) {
        break;
      }
      for (const c of cards) {
        if (
          c &&
          typeof c.shortLink === "string" &&
          c.shortLink.toLowerCase() === want
        ) {
          return c.id;
        }
      }
      if (cards.length < 1000) {
        break;
      }
      before = cards[cards.length - 1].id;
    }
  }
  return null;
}

/** GET card by short link; on 404, resolve via TRELLO_BOARD_ID card list. */
async function getCardId(key, token, shortFromCommit) {
  const short = shortFromCommit.trim();
  const u = new URL(
    `https://api.trello.com/1/cards/${encodeURIComponent(short)}`,
  );
  u.searchParams.set("key", key);
  u.searchParams.set("token", token);
  u.searchParams.set("fields", "id,shortLink");
  const res = await fetch(u);
  const body = await res.text();
  if (res.ok) {
    const j = JSON.parse(body);
    if (j?.id) {
      return j.id;
    }
  }
  if (res.status === 404) {
    dbg("direct card GET 404, scanning TRELLO_BOARD_ID for shortLink", short);
    const fromBoard = await findCardIdOnBoards(key, token, short);
    if (fromBoard) {
      return fromBoard;
    }
    throw new Error(
      `Trello: card "${short}" not found via API and not on board(s) TRELLO_BOARD_ID. Use the XXXXXXXX from your card URL (trello.com/c/XXXXXXXX/…), and set TRELLO_BOARD_ID to that card's board.`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `Trello get card ${res.status} ${short}: ${body.slice(0, 200)}`,
    );
  }
  const j2 = JSON.parse(body);
  if (!j2?.id) {
    throw new Error("Trello get card: missing id in response");
  }
  return j2.id;
}

async function addCommentToCard(key, token, shortLink, text) {
  const cardId = await getCardId(key, token, shortLink);
  const u = new URL(
    `https://api.trello.com/1/cards/${encodeURIComponent(cardId)}/actions/comments`,
  );
  const res = await fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ key, token, text: text }).toString(),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `Trello comment ${res.status} for card ${shortLink}: ${errBody.slice(0, 400)}`,
    );
  }
}

function dbg(...a) {
  if (process.env.TRELLO_DEBUG === "1") {
    console.log("[trello-post-push]", ...a);
  }
}

async function processPending(raw) {
  if (process.env.SKIP_TRELLO_POST === "1") {
    dbg("SKIP_TRELLO_POST=1");
    return;
  }

  if (!raw.trim()) {
    console.warn(
      "[trello-post-push] No ref data (empty pending file). Pre-push may not have run, or stdin was empty.",
    );
    return;
  }

  dbg("pending lines:\n", raw);

  const branches = (process.env.TRELLO_POST_PUSH_BRANCHES || "").trim();
  if (!branches) {
    console.warn(
      "[trello-post-push] Add TRELLO_POST_PUSH_BRANCHES=main (comma-separated) to .env to post comments after push.",
    );
    return;
  }

  const strict = process.env.TRELLO_STRICT_POST === "1";
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!key || !token) {
    const msg =
      "trello-post-push: set TRELLO_API_KEY and TRELLO_TOKEN (token needs write: post comments to cards).";
    if (strict) {
      throw new Error(msg);
    }
    console.warn(
      msg,
      "— skipping Trello (set TRELLO_STRICT_POST=1 to fail push on this).",
    );
    return;
  }

  const base = remoteWebBase();
  if (!base) {
    const msg =
      "trello-post-push: could not build commit URL. Set TRELLO_COMMIT_BASE_URL=https://.../user/repo (no trailing /commit) or use a known remote.origin.url";
    if (strict) {
      throw new Error(msg);
    }
    console.warn(msg, "— skipping Trello");
    return;
  }

  const pushes = parsePushLines(raw);
  if (pushes.length === 0) {
    console.warn(
      "[trello-post-push] Could not parse pre-push ref lines. Set TRELLO_DEBUG=1 to inspect.",
    );
    return;
  }

  const seen = new Set();
  let posted = 0;
  let hadNewCommitsOnTrackedBranch = false;
  let anyBranchMatched = false;

  for (const { localSha, remoteRef, remoteSha } of pushes) {
    dbg("ref line remoteRef=", remoteRef, "localSha=", localSha?.slice(0, 7));
    if (!shouldPostForBranch(branches, remoteRef)) {
      dbg(
        "skip (not in TRELLO_POST_PUSH_BRANCHES):",
        remoteRef,
        "branches=",
        branches,
      );
      continue;
    }
    anyBranchMatched = true;
    if (!localSha) continue;
    const shas = listCommitsForPush(localSha, remoteSha);
    dbg("commits in push:", shas.length);
    if (shas.length === 0) {
      console.warn(
        "[trello-post-push] No new commits for this ref (push may be \"already up to date\"). Nothing to post.",
      );
    } else {
      hadNewCommitsOnTrackedBranch = true;
    }
    for (const sha of shas) {
      if (seen.has(sha)) continue;
      seen.add(sha);
      const first = firstLineOfCommit(sha);
      if (first.toLowerCase().startsWith("merge ")) {
        continue;
      }
      const m = first.match(SUBJECT);
      if (!m) {
        continue;
      }
      const shortLink = m[1].toLowerCase();
      const short = sha.slice(0, 7);
      const url = `${base}/commit/${sha}`;
      const line = `**Commit** [${short}](${url}) `;
      const subject = m[2].trim() || sha;
      const text = `${line}— _${subject.replace(/"/g, "'")}_`;
      try {
        await addCommentToCard(key, token, shortLink, text);
        posted += 1;
        console.log(`Trello: commented on card ${shortLink} (${short})`);
      } catch (e) {
        console.error(e.message);
        if (strict) {
          throw e;
        }
      }
    }
  }

  if (posted === 0 && hadNewCommitsOnTrackedBranch) {
    console.warn(
      '[trello-post-push] 0 Trello comments posted. Fix API errors above, or use commit message "SHORTID - description" (Trello shortLink, 7–8 chars).',
    );
  } else if (!anyBranchMatched && branches) {
    console.warn(
      `[trello-post-push] No ref matched TRELLO_POST_PUSH_BRANCHES="${branches}". Pushed ref(s) must be refs/heads/<name> (e.g. main). Set TRELLO_DEBUG=1 to see what Git sent.`,
    );
  }
}

async function main() {
  loadDotenv();
  const fileArg = process.argv[2];
  const pending = fileArg && existsSync(fileArg) ? fileArg : null;
  let raw;
  if (pending) {
    raw = readFileSync(pending, "utf8");
  } else {
    if (fileArg) {
      console.warn(
        "trello-post-push: path not found, reading stdin (see npm run git:push after a successful push).",
      );
    }
    raw = readFileSync(0, "utf8");
  }
  try {
    await processPending(raw);
  } finally {
    if (pending) {
      try {
        unlinkSync(pending);
      } catch {
        /* ignore */
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
