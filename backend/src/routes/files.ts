import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { WORKSPACE_DIR } from "../config.js";

const router = Router();

fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

const MAX_WRITE_BYTES = 5 * 1024 * 1024; // 5MB

// Resolve a requested path and verify it stays strictly inside WORKSPACE_DIR.
function safeResolve(relPath: string): string | null {
  if (typeof relPath !== "string" || !relPath.trim()) return null;
  if (path.isAbsolute(relPath)) return null;
  if (relPath.includes("\0")) return null;
  const resolved = path.resolve(WORKSPACE_DIR, relPath);
  const base = WORKSPACE_DIR.endsWith(path.sep) ? WORKSPACE_DIR : WORKSPACE_DIR + path.sep;
  if (resolved !== WORKSPACE_DIR && !resolved.startsWith(base)) return null;
  return resolved;
}

// POST /api/files/write - LLM-authored file, sandboxed to workspace/
router.post("/write", (req, res) => {
  const { path: relPath, content } = req.body ?? {};
  const resolved = safeResolve(relPath);
  if (!resolved) return res.status(400).json({ error: "Invalid path. Files must be written inside the workspace folder." });
  if (typeof content !== "string") return res.status(400).json({ error: "content must be a string" });
  if (Buffer.byteLength(content, "utf-8") > MAX_WRITE_BYTES) return res.status(400).json({ error: "File too large (max 5MB)." });

  try {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, "utf-8");
    res.json({ ok: true, path: path.relative(WORKSPACE_DIR, resolved) });
  } catch {
    res.status(500).json({ error: "Could not write the file." });
  }
});

// GET /api/files - list files currently in the workspace
router.get("/", (_req, res) => {
  try {
    const out: { path: string; size: number }[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else out.push({ path: path.relative(WORKSPACE_DIR, full), size: fs.statSync(full).size });
      }
    };
    walk(WORKSPACE_DIR);
    res.json({ files: out });
  } catch {
    res.json({ files: [] });
  }
});

export default router;
