import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In a packaged desktop build the app bundle is read-only, so all writable
// state (config, database, uploads, the agent workspace) must live in a
// user-writable folder. The Electron shell sets FAF_USER_DATA to its per-user
// data directory; when it is absent (npm run dev / the node launcher) we fall
// back to the in-repo paths so local development is unchanged.
const USER_DATA = process.env.FAF_USER_DATA?.trim();
const CONFIG_PATH = USER_DATA
  ? path.join(USER_DATA, "app-config.json")
  : path.resolve(__dirname, "..", "app-config.json");

export interface MachineInfo {
  arch: string;
  totalRamGb: number;
  reservedRamGb: number;
  modelBudgetGb: number;
  freeDiskGb: number;
}

export type ApprovalMode = "ask-every-time" | "auto-in-workdir";
export type Theme = "light" | "dark" | "system";

export interface AppConfig {
  defaultModel: string;
  systemPrompt: string;
  temperature: number;
  webSearchEnabled: boolean;
  approvalMode: ApprovalMode;
  agentWorkingDir: string;
  unloadOnClose: boolean;
  unloadAfterIdle: boolean;
  idleMinutes: number;
  theme: Theme;
  machine: MachineInfo;
}

export const WORKSPACE_DIR = USER_DATA
  ? path.join(USER_DATA, "workspace")
  : path.resolve(__dirname, "..", "..", "workspace");
export const DATA_DIR = USER_DATA
  ? path.join(USER_DATA, "data")
  : path.resolve(__dirname, "..", "data");
export const UPLOAD_DIR = USER_DATA
  ? path.join(USER_DATA, "uploads")
  : path.resolve(__dirname, "..", "uploads");

// Make sure the writable folders exist before anything tries to use them.
for (const dir of [WORKSPACE_DIR, DATA_DIR, UPLOAD_DIR]) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* best effort; individual modules also guard their own writes */
  }
}

const DEFAULTS: AppConfig = {
  defaultModel: "qwen2.5:32b",
  systemPrompt: "You are a helpful, agentic assistant running locally on the user's computer with internet access via tools.",
  temperature: 0.7,
  webSearchEnabled: true,
  approvalMode: "auto-in-workdir",
  agentWorkingDir: "",
  unloadOnClose: false,
  unloadAfterIdle: false,
  idleMinutes: 15,
  theme: "system",
  machine: {
    arch: "arm64",
    totalRamGb: 16,
    reservedRamGb: 6,
    modelBudgetGb: 10,
    freeDiskGb: 100,
  },
};

export function loadConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed, machine: { ...DEFAULTS.machine, ...parsed.machine } };
  } catch {
    return DEFAULTS;
  }
}

export function saveConfig(patch: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const next: AppConfig = {
    ...current,
    ...patch,
    machine: { ...current.machine, ...(patch.machine ?? {}) },
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2));
  return next;
}

// Resolve the configured agent working directory to an absolute path.
// Empty / invalid config falls back to the bundled workspace/ folder.
export function getWorkingDir(): string {
  const cfg = loadConfig();
  const dir = cfg.agentWorkingDir?.trim();
  if (!dir) return WORKSPACE_DIR;
  try {
    const resolved = path.resolve(dir);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) return resolved;
  } catch {
    /* fall through */
  }
  return WORKSPACE_DIR;
}

export const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
export const PORT = Number(process.env.PORT ?? 5174);
export const HOST = "127.0.0.1";
