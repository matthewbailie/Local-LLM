import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Gitignored local secrets file - never committed.
const SECRETS_PATH = path.resolve(__dirname, "..", "secrets.local.json");

interface Secrets {
  searchApiKey?: string;
}

function read(): Secrets {
  try {
    return JSON.parse(fs.readFileSync(SECRETS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

// Prefer an explicit env var, then the local secrets file.
export function getSearchApiKey(): string | undefined {
  return process.env.TAVILY_API_KEY || read().searchApiKey || undefined;
}

export function hasSearchApiKey(): boolean {
  return !!getSearchApiKey();
}

export function setSearchApiKey(key: string): void {
  const current = read();
  if (key.trim()) current.searchApiKey = key.trim();
  else delete current.searchApiKey;
  fs.writeFileSync(SECRETS_PATH, JSON.stringify(current, null, 2), { mode: 0o600 });
}
