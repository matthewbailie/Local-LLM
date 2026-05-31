#!/usr/bin/env node
// Free AI Forever - one-click launcher.
// Installs dependencies and builds the app the first time, starts the
// single-port server, waits until it is ready, then opens the app in a
// standalone "app window" (Chrome/Edge --app), falling back to the default
// browser. Keep this process running while you use the app; press Ctrl+C
// (or close the window) to stop it.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 5174;
const APP_URL = `http://127.0.0.1:${PORT}/`;
const isWin = process.platform === "win32";

function runSync(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: isWin });
  if (r.status !== 0) {
    console.error(`\n"${cmd} ${args.join(" ")}" failed. See the messages above.`);
    process.exit(r.status ?? 1);
  }
}

// 1. First-run setup: install dependencies if any are missing.
const depsMissing =
  !existsSync(path.join(root, "node_modules")) ||
  !existsSync(path.join(root, "backend", "node_modules")) ||
  !existsSync(path.join(root, "frontend", "node_modules"));
if (depsMissing) {
  console.log("First run: installing dependencies (this can take a few minutes)...");
  runSync("npm", ["install"]);
}

// 2. First-run setup: build the app if the compiled output is missing.
const buildMissing =
  !existsSync(path.join(root, "backend", "dist", "index.js")) ||
  !existsSync(path.join(root, "frontend", "dist", "index.html"));
if (buildMissing) {
  console.log("First run: building the app (this can take a minute)...");
  runSync("npm", ["run", "build"]);
}

// 3. Start the single-port server (serves the built frontend + the API).
console.log("Starting Free AI Forever...");
const server = spawn("node", [path.join(root, "backend", "dist", "index.js")], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PORT: String(PORT) },
});

server.on("exit", (code) => process.exit(code ?? 0));

// Stop the server cleanly when this launcher is asked to quit.
const shutdown = () => {
  if (!server.killed) server.kill("SIGTERM");
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// 4. Wait until the server answers, then open the app window.
let opened = false;
function waitForServer(attempt = 0) {
  const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
    res.resume();
    if (res.statusCode === 200) openApp();
    else retry(attempt);
  });
  req.on("error", () => retry(attempt));
  req.setTimeout(1500, () => req.destroy());
}
function retry(attempt) {
  if (attempt > 120) {
    console.log(`\nThe app is starting. If your browser did not open, go to ${APP_URL}`);
    return;
  }
  setTimeout(() => waitForServer(attempt + 1), 400);
}
setTimeout(() => waitForServer(), 500);

// Open Chrome/Edge in app mode for a clean standalone window; otherwise fall
// back to the default browser. App mode means no tabs/address bar and its own
// Dock/taskbar entry, so it looks and feels like a normal desktop app.
function openApp() {
  if (opened) return;
  opened = true;
  console.log(`\nFree AI Forever is ready at ${APP_URL}`);
  const appArg = `--app=${APP_URL}`;

  const detached = (cmd, args) => {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
      child.unref();
      return true;
    } catch {
      return false;
    }
  };

  if (process.platform === "darwin") {
    const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    const edge = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
    const brave = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
    if (existsSync(chrome)) return void detached(chrome, [appArg]);
    if (existsSync(edge)) return void detached(edge, [appArg]);
    if (existsSync(brave)) return void detached(brave, [appArg]);
    spawnSync("open", [APP_URL]); // default browser, normal window
  } else if (isWin) {
    // Try Chrome, then Edge (ships with Windows), then the default browser.
    let r = spawnSync("cmd", ["/c", "start", "", "chrome", appArg], { shell: true });
    if (r.status !== 0) r = spawnSync("cmd", ["/c", "start", "", "msedge", appArg], { shell: true });
    if (r.status !== 0) spawnSync("cmd", ["/c", "start", "", APP_URL], { shell: true });
  } else {
    // Linux
    const candidates = ["google-chrome", "google-chrome-stable", "microsoft-edge", "chromium", "chromium-browser"];
    for (const c of candidates) {
      const which = spawnSync("which", [c]);
      if (which.status === 0) return void detached(c, [appArg]);
    }
    spawnSync("xdg-open", [APP_URL]);
  }
}
