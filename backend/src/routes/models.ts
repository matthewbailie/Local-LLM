import { Router } from "express";
import { CATALOG, CatalogModel, annotateFamilyAndLatest, estimateRamGb, tagSupportsTools } from "../catalog.js";
import { getDiscovered, refreshDiscovered } from "../discovery.js";
import { loadConfig } from "../config.js";
import { listLocalModels, pullModel, deleteModel, listRunningModels, unloadModelFromMemory, loadModelIntoMemory } from "../ollama.js";

const router = Router();

// GET /api/models/runtime - which models are currently loaded in memory
router.get("/runtime", async (_req, res) => {
  try {
    const running = await listRunningModels();
    const total = running.reduce((sum, m) => sum + (m.size ?? 0), 0);
    res.json({ loaded: running.length > 0, models: running.map((m) => ({ tag: m.name, size: m.size, vram: m.size_vram })), totalSize: total });
  } catch {
    res.status(503).json({ error: "Ollama is not reachable.", loaded: false, models: [] });
  }
});

// POST /api/models/load - warm up a model into memory (no chat message needed)
router.post("/load", async (req, res) => {
  try {
    const tag = typeof req.body?.tag === "string" ? req.body.tag.trim() : "";
    if (!tag) return res.status(400).json({ error: "A model tag is required." });
    await loadModelIntoMemory(tag);
    const running = await listRunningModels();
    res.json({ loaded: running.length > 0, models: running.map((m) => ({ tag: m.name, size: m.size })) });
  } catch {
    res.status(500).json({ error: "Could not load the model into memory." });
  }
});

// POST /api/models/unload - free RAM by unloading the active model (or all loaded)
router.post("/unload", async (req, res) => {
  try {
    const tag = typeof req.body?.tag === "string" && req.body.tag.trim() ? req.body.tag.trim() : null;
    const running = await listRunningModels();
    const targets = tag ? running.filter((m) => m.name === tag).map((m) => m.name) : running.map((m) => m.name);
    for (const t of targets) await unloadModelFromMemory(t);
    const after = await listRunningModels();
    res.json({ unloaded: targets, loaded: after.length > 0 });
  } catch {
    res.status(500).json({ error: "Could not unload the model." });
  }
});

// GET /api/models - locally installed models
router.get("/", async (_req, res) => {
  try {
    const models = await listLocalModels();
    res.json({
      models: models.map((m) => ({
        tag: m.name,
        size: m.size,
        family: m.details?.family,
        parameters: m.details?.parameter_size,
        ramGb: estimateRamGb(m.name, m.size),
        toolCalling: tagSupportsTools(m.name),
      })),
    });
  } catch {
    res.status(503).json({ error: "Ollama is not reachable. Start it and try again." });
  }
});

// Curated catalog plus any models discovered on the internet (deduped, catalog wins).
function combinedCatalog(discovered: CatalogModel[]): CatalogModel[] {
  const seen = new Set(CATALOG.map((m) => m.tag));
  return [...CATALOG, ...discovered.filter((d) => !seen.has(d.tag))];
}

// All tags we recognise (catalog + currently cached discovered), for pull validation.
function knownTags(): Set<string> {
  return new Set(combinedCatalog(getDiscovered()).map((m) => m.tag));
}

// GET /api/models/available?reservedRamGb=<n>&refresh=<true|false> - downloadable
// catalog with live fit flags and one "latest" badge per model family. When
// refresh=true, query the internet for newly published open-source models.
// Fit is computed against LLM budget = total RAM - reservedRamGb (from the Settings slider).
router.get("/available", async (req, res) => {
  const cfg = loadConfig();
  let installed = new Set<string>();
  try {
    const local = await listLocalModels();
    installed = new Set(local.map((m) => m.name));
  } catch {
    // Ollama may be down; still return catalog with installed=false.
  }

  const refresh = req.query.refresh === "true";
  let discovered: CatalogModel[] = [];
  let stale = false;
  if (refresh) {
    const r = await refreshDiscovered();
    discovered = r.models;
    stale = r.stale;
  } else {
    discovered = getDiscovered();
  }

  const reservedParam = Number(req.query.reservedRamGb);
  const reservedRamGb = Number.isFinite(reservedParam) && reservedParam >= 0 ? reservedParam : cfg.machine.reservedRamGb;
  const budget = Math.max(0, cfg.machine.totalRamGb - reservedRamGb);
  const freeDisk = cfg.machine.freeDiskGb;
  // Annotate family + per-family "latest" across the combined list, then add fit flags.
  const annotated = annotateFamilyAndLatest(combinedCatalog(discovered));
  const catalog = annotated.map((m) => ({
    ...m,
    installed: installed.has(m.tag),
    fitsRam: m.ramGb <= budget,
    fitsDisk: m.downloadSizeGb + 5 <= freeDisk,
    fits: m.ramGb <= budget && m.downloadSizeGb + 5 <= freeDisk,
  }));
  res.json({ machine: { ...cfg.machine, reservedRamGb, modelBudgetGb: budget }, models: catalog, stale });
});

// POST /api/models/pull - stream pull progress as NDJSON
router.post("/pull", async (req, res) => {
  const tag = req.body?.tag;
  // Accept any tag we recognise from the catalog or a prior internet discovery.
  // The safe-character check is defense-in-depth against arbitrary registry input.
  const safe = typeof tag === "string" && /^[a-zA-Z0-9._:\/-]{1,128}$/.test(tag);
  if (!safe || !knownTags().has(tag)) {
    return res.status(400).json({ error: "Unknown model tag." });
  }
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");

  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  try {
    await pullModel(
      tag,
      (line) => {
        if (!res.writableEnded) res.write(line + "\n");
      },
      controller.signal
    );
    if (!res.writableEnded) {
      res.write(JSON.stringify({ status: "success" }) + "\n");
      res.end();
    }
  } catch (e) {
    if (!res.writableEnded) {
      const raw = e instanceof Error ? e.message : "";
      // Map common Ollama failures to a clear, actionable message.
      const friendly = /manifest|file does not exist|not found/i.test(raw)
        ? "This model can't be downloaded to run locally (it may be a cloud-only model). Pick a model that lists a size."
        : "Download failed. Check your internet connection and try again.";
      res.write(JSON.stringify({ status: "error", error: friendly }) + "\n");
      res.end();
    }
  }
});

// DELETE /api/models/:tag - remove a local model
router.delete("/:tag(*)", async (req, res) => {
  const tag = req.params.tag;
  if (!tag) return res.status(400).json({ error: "Tag required" });
  try {
    await deleteModel(tag);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Could not remove the model." });
  }
});

export default router;
