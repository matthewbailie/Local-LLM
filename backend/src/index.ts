import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOST, PORT } from "./config.js";
import "./db.js";
import chatsRouter from "./routes/chats.js";
import chatRouter from "./routes/chat.js";
import uploadRouter from "./routes/upload.js";
import filesRouter from "./routes/files.js";
import modelsRouter from "./routes/models.js";
import settingsRouter from "./routes/settings.js";
import toolsRouter from "./routes/tools.js";

const app = express();

// Localhost-only: allow the Vite dev origin on loopback.
app.use(
  cors({
    origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/],
  })
);
app.use(express.json({ limit: "30mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/chats", chatsRouter);
app.use("/api/chat", chatRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/files", filesRouter);
app.use("/api/models", modelsRouter);
app.use("/api/config", settingsRouter);
app.use("/api/tools", toolsRouter);

// Single-port mode: when the frontend has been built, serve it from this same
// server so the whole app runs on one URL (no separate dev server). This is
// what the desktop launcher uses; `npm run dev` is unaffected (Vite proxies
// /api here). The frontend calls the API with relative paths, so it works
// same-origin without any extra config.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, "..", "..", "frontend", "dist");
if (fs.existsSync(path.join(frontendDist, "index.html"))) {
  app.use(express.static(frontendDist));
  // SPA fallback: send index.html for any non-API GET so client routing works.
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// Fail securely: never leak stack traces or paths.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err instanceof Error ? err.message : err);
  if (!res.headersSent) res.status(500).json({ error: "Something went wrong." });
});

const servingFrontend = fs.existsSync(path.join(frontendDist, "index.html"));
app.listen(PORT, HOST, () => {
  if (servingFrontend) {
    console.log(`Free AI Forever is running. Open http://${HOST}:${PORT}/ in your browser.`);
  } else {
    console.log(`Free AI Forever backend listening on http://${HOST}:${PORT} (API only; run the frontend dev server too).`);
  }
});
