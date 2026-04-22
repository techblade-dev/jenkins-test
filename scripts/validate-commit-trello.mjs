// commit-msg: validates format and Trello shortLink; env + .env — see .env.example
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { loadDotenv, repoRoot } from "./lib/dotenv.mjs";

const FORMAT = /^([a-zA-Z0-9]{7,8}) - (.+)$/;
const CACHE_PATH = path.join(repoRoot, ".husky", ".trello-cache.json");
const CACHE_DIR = path.dirname(CACHE_PATH);

function readCache() {
  try {
    const raw = readFileSync(CACHE_PATH, "utf8");
    const j = JSON.parse(raw);
    const ttl = (Number(process.env.TRELLO_CACHE_MINUTES) || 15) * 60 * 1000;
    if (
      typeof j.fetched === "number" &&
      Date.now() - j.fetched < ttl &&
      Array.isArray(j.ids)
    ) {
      return new Set(j.ids.map((x) => String(x).toLowerCase()));
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeCache(ids) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(
      CACHE_PATH,
      JSON.stringify({ fetched: Date.now(), ids: [...ids] }, null, 0),
      "utf8",
    );
  } catch (e) {
    console.warn("Could not write Trello cache:", e.message);
  }
}

async function fetchBoardCardIds(boardId, key, token) {
  const collected = [];
  let before = undefined;
  for (;;) {
    const u = new URL(
      `https://api.trello.com/1/boards/${encodeURIComponent(boardId)}/cards`,
    );
    u.searchParams.set("key", key);
    u.searchParams.set("token", token);
    u.searchParams.set("fields", "shortLink");
    u.searchParams.set("filter", "all");
    u.searchParams.set("limit", "1000");
    if (before) u.searchParams.set("before", before);
    const res = await fetch(u, { method: "GET" });
    const body = await res.text();
    if (!res.ok) {
      throw new Error(
        `Trello HTTP ${res.status} for board ${boardId}: ${body.slice(0, 200)}`,
      );
    }
    const cards = JSON.parse(body);
    if (!Array.isArray(cards) || cards.length === 0) break;
    for (const c of cards) {
      if (c && typeof c.shortLink === "string" && c.shortLink.length) {
        collected.push(c.shortLink);
      }
    }
    if (cards.length < 1000) break;
    before = cards[cards.length - 1].id;
  }
  return collected;
}

async function fetchAllValidIds() {
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  const boardsRaw = process.env.TRELLO_BOARD_ID;
  if (!key || !token || !boardsRaw) {
    console.error(
      "Missing Trello env. Set TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID (see .env.example).",
    );
    process.exit(1);
  }
  const boardIds = boardsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const all = new Set();
  for (const bid of boardIds) {
    const ids = await fetchBoardCardIds(bid, key, token);
    for (const id of ids) all.add(id.toLowerCase());
  }
  if (all.size === 0) {
    console.error(
      "No card shortLink values returned from Trello. Check TRELLO_BOARD_ID and board access.",
    );
    process.exit(1);
  }
  return all;
}

async function main() {
  loadDotenv();

  if (
    process.env.SKIP_TRELLO_VALIDATE === "1" ||
    process.env.SKIP_TRELLO === "1"
  ) {
    process.exit(0);
  }

  let commitFile = process.argv[2];
  if (!commitFile) {
    const guess = path.join(repoRoot, ".git", "COMMIT_EDITMSG");
    if (existsSync(guess)) commitFile = guess;
  }
  if (!commitFile) {
    console.error(
      "Usage: validate-commit-trello.mjs <path-to-commit-message-file>",
    );
    process.exit(1);
  }

  const raw = readFileSync(commitFile, "utf8").replace(/\r\n/g, "\n");
  const msg = raw.trimEnd();
  const first = msg.split("\n").find((l) => l.trim().length > 0) ?? "";

  if (first.toLowerCase().startsWith("merge ")) {
    process.exit(0);
  }

  if (!FORMAT.test(first)) {
    console.error("Invalid commit format.");
    console.error("Use: <TRELLO_SHORT_LINK> - message");
    console.error(
      "(7–8 alphanumeric id from the Trello card URL, e.g. AbCdEfGh - add login page)",
    );
    process.exit(1);
  }

  if (
    !process.env.TRELLO_API_KEY ||
    !process.env.TRELLO_TOKEN ||
    !process.env.TRELLO_BOARD_ID
  ) {
    console.error(
      "Missing Trello env. Set TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID (see .env.example).",
    );
    process.exit(1);
  }

  const m = first.match(FORMAT);
  const id = m[1].toLowerCase();
  let valid = readCache();
  if (!valid) {
    valid = await fetchAllValidIds();
    writeCache(valid);
  }
  if (!valid.has(id)) {
    console.error(
      `Unknown Trello card id "${id}". It is not on the configured board(s).`,
    );
    console.error(
      "Refresh cache: delete .husky/.trello-cache.json and commit again, or add the card in Trello.",
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
