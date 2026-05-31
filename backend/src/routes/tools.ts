import { Router } from "express";
import { loadConfig } from "../config.js";
import { classifyPath, deletePath, FsError, listDirectory, makeDir, needsApproval, readFile, writeFile } from "../tools/fs.js";
import { fetchUrl, webSearch, WebError } from "../tools/web.js";

const router = Router();

function fail(res: import("express").Response, err: unknown, status = 400) {
  const msg = err instanceof FsError || err instanceof WebError ? err.message : "The operation failed.";
  res.status(status).json({ error: msg });
}

router.post("/web-search", async (req, res) => {
  if (!loadConfig().webSearchEnabled) return res.status(403).json({ error: "Web search is disabled in Settings." });
  try {
    res.json({ results: await webSearch(req.body?.query) });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/fetch-url", async (req, res) => {
  if (!loadConfig().webSearchEnabled) return res.status(403).json({ error: "Web access is disabled in Settings." });
  try {
    res.json(await fetchUrl(req.body?.url));
  } catch (err) {
    fail(res, err);
  }
});

router.post("/fs/list", (req, res) => {
  try {
    res.json({ result: listDirectory(req.body?.path) });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/fs/read", (req, res) => {
  try {
    res.json({ content: readFile(req.body?.path) });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/fs/write", (req, res) => {
  try {
    const info = classifyPath(req.body?.path);
    if (needsApproval("write", info.insideWorkdir, loadConfig().approvalMode) && req.body?.approved !== true) {
      return res.status(403).json({ requiresApproval: true, path: info.abs, error: "This write requires approval." });
    }
    res.json({ path: writeFile(req.body?.path, req.body?.content) });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/fs/mkdir", (req, res) => {
  try {
    const info = classifyPath(req.body?.path);
    if (needsApproval("mkdir", info.insideWorkdir, loadConfig().approvalMode) && req.body?.approved !== true) {
      return res.status(403).json({ requiresApproval: true, path: info.abs, error: "Creating this folder requires approval." });
    }
    res.json({ path: makeDir(req.body?.path) });
  } catch (err) {
    fail(res, err);
  }
});

router.post("/fs/delete", (req, res) => {
  try {
    const info = classifyPath(req.body?.path);
    if (req.body?.approved !== true) {
      return res.status(403).json({ requiresApproval: true, path: info.abs, error: "Deletes always require approval." });
    }
    res.json({ path: deletePath(req.body?.path) });
  } catch (err) {
    fail(res, err);
  }
});

export default router;
