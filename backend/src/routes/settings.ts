import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { getWorkingDir, loadConfig, saveConfig, type AppConfig } from "../config.js";
import { hasSearchApiKey, setSearchApiKey } from "../secrets.js";

const router = Router();

// GET /api/config - current app settings + machine profile + resolved working dir.
// The search API key is never returned; only whether one is configured.
router.get("/", (_req, res) => {
  res.json({ ...loadConfig(), resolvedWorkingDir: getWorkingDir(), hasSearchApiKey: hasSearchApiKey() });
});

// PATCH /api/config - update settings
router.patch("/", (req, res) => {
  const patch: Partial<AppConfig> = {};
  const b = req.body ?? {};

  if (typeof b.systemPrompt === "string" && b.systemPrompt.length <= 10_000) patch.systemPrompt = b.systemPrompt;
  if (typeof b.temperature === "number" && b.temperature >= 0 && b.temperature <= 2) patch.temperature = b.temperature;
  if (typeof b.defaultModel === "string" && b.defaultModel.trim()) patch.defaultModel = b.defaultModel.trim();
  if (typeof b.webSearchEnabled === "boolean") patch.webSearchEnabled = b.webSearchEnabled;
  if (b.approvalMode === "ask-every-time" || b.approvalMode === "auto-in-workdir") patch.approvalMode = b.approvalMode;
  if (typeof b.unloadOnClose === "boolean") patch.unloadOnClose = b.unloadOnClose;
  if (typeof b.unloadAfterIdle === "boolean") patch.unloadAfterIdle = b.unloadAfterIdle;
  if (typeof b.idleMinutes === "number" && b.idleMinutes >= 1 && b.idleMinutes <= 240) patch.idleMinutes = Math.round(b.idleMinutes);
  if (b.theme === "light" || b.theme === "dark" || b.theme === "system") patch.theme = b.theme;

  if (typeof b.reservedRamGb === "number" && b.reservedRamGb >= 0) {
    const machine = loadConfig().machine;
    const reserved = Math.min(b.reservedRamGb, machine.totalRamGb);
    patch.machine = { ...machine, reservedRamGb: reserved, modelBudgetGb: Math.max(0, machine.totalRamGb - reserved) };
  }

  if (typeof b.agentWorkingDir === "string") {
    const dir = b.agentWorkingDir.trim();
    if (dir === "") {
      patch.agentWorkingDir = "";
    } else {
      const resolved = path.resolve(dir);
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return res.status(400).json({ error: "That folder does not exist." });
      }
      patch.agentWorkingDir = resolved;
    }
  }

  // Search API key is stored in a gitignored local secrets file, never in config.
  let keyTouched = false;
  if (typeof b.searchApiKey === "string") {
    setSearchApiKey(b.searchApiKey);
    keyTouched = true;
  }

  if (Object.keys(patch).length === 0 && !keyTouched) return res.status(400).json({ error: "Nothing valid to update" });
  const saved = saveConfig(patch);
  res.json({ ...saved, resolvedWorkingDir: getWorkingDir(), hasSearchApiKey: hasSearchApiKey() });
});

export default router;
