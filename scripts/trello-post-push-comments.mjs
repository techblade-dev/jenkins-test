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
    const parts = line.trim().split(/\s+/);
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
  if (!refIsBranch(remoteRef)) return false;
  const name = branchNameFromRef(remoteRef);
  const set = new Set(
    branches
      .split(",")
      .map((b) => b.trim())
      .filter(Boolean),
  );
  return set.has(name);
}

async function addCommentToCard(key, token, shortLink, text) {
  const u = new URL(
    `https://api.trello.com/1/cards/${encodeURIComponent(shortLink)}/actions/comments`,
  );
  u.searchParams.set("key", key);
  u.searchParams.set("token", token);
  const res = await fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ text }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(
      `Trello comment ${res.status} for card ${shortLink}: ${errBody.slice(0, 300)}`,
    );
  }
}

async function processPending(raw) {
  if (process.env.SKIP_TRELLO_POST === "1") {
    return;
  }

  if (!raw.trim()) {
    return;
  }

  const branches = (process.env.TRELLO_POST_PUSH_BRANCHES || "").trim();
  if (!branches) {
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
  const seen = new Set();

  for (const { localSha, remoteRef, remoteSha } of pushes) {
    if (!shouldPostForBranch(branches, remoteRef)) {
      continue;
    }
    if (!localSha) continue;
    const shas = listCommitsForPush(localSha, remoteSha);
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
        console.log(`Trello: commented on card ${shortLink} (${short})`);
      } catch (e) {
        console.error(e.message);
        if (strict) {
          throw e;
        }
      }
    }
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
