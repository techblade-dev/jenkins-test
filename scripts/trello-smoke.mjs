// Quick check: can we read a board and post a no-op? Run: node scripts/trello-smoke.mjs
import { loadDotenv, repoRoot } from "./lib/dotenv.mjs";

loadDotenv();
const k = process.env.TRELLO_API_KEY;
const t = process.env.TRELLO_TOKEN;
const b = process.env.TRELLO_BOARD_ID;
if (!k || !t) {
  console.error("Set TRELLO_API_KEY and TRELLO_TOKEN in .env (repo root:", repoRoot, ")");
  process.exit(1);
}
const u = new URL(`https://api.trello.com/1/members/me/boards`);
u.searchParams.set("key", k);
u.searchParams.set("token", t);
u.searchParams.set("fields", "id,name");
const res = await fetch(u);
const body = await res.text();
if (!res.ok) {
  console.error("Trello", res.status, body.slice(0, 500));
  process.exit(1);
}
console.log("OK: Trello key/token can list boards. First boards:", body.slice(0, 200));
if (b) {
  const u2 = new URL(
    `https://api.trello.com/1/boards/${encodeURIComponent(b)}/cards`,
  );
  u2.searchParams.set("key", k);
  u2.searchParams.set("token", t);
  u2.searchParams.set("fields", "shortLink");
  u2.searchParams.set("limit", "1");
  const r2 = await fetch(u2);
  const b2 = await r2.text();
  console.log(
    "Board",
    b,
    "cards sample:",
    r2.ok ? b2 : r2.status + " " + b2.slice(0, 200),
  );
}
