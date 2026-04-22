import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.join(__dirname, "..", "..");

export function loadDotenv() {
  const p = path.join(repoRoot, ".env");
  if (!existsSync(p)) return;
  let text = readFileSync(p, "utf8");
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
    let v = line.slice(eq + 1);
    v = v.trim();
    if (
      (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
      (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
    ) {
      v = v.slice(1, -1);
    } else {
      v = v.replace(/\s+#.*$/, "").trim();
    }
    if (process.env[k] === undefined) {
      process.env[k] = v;
    }
  }
}
