// Free AI Forever - Electron desktop shell.
//
// This wraps the existing single-port server in a real desktop app so end users
// do NOT need Node.js installed: Electron ships its own Node runtime. We launch
// the compiled backend (backend/dist/index.js) as a child process using that
// bundled runtime (ELECTRON_RUN_AS_NODE), then load the app in a window. The
// backend serves both the API and the built frontend on one local port.
//
// Ollama is still required separately - it is a system service that runs the
// models - so we check for it on startup and point the user to the installer if
// it is missing.

const { app, BrowserWindow, dialog, shell, Menu } = require("electron");
// Note: Ollama detection and first-model setup are handled by the in-app
// onboarding screen (so they work the same in the packaged app and in dev),
// so the shell no longer shows its own Ollama dialog.
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 5174);
const BASE_URL = `http://${HOST}:${PORT}`;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";

let backend = null;
let mainWindow = null;
let quitting = false;

// Resolve a path inside the packaged resources (or the repo, in dev).
function resourcePath(...parts) {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...parts)
    : path.join(__dirname, "..", ...parts);
}

// Start the backend server using Electron's bundled Node. The backend writes
// all of its state (config, SQLite DB, uploads, agent workspace) under the
// per-user data directory, since the app bundle itself is read-only.
function startBackend() {
  const entry = resourcePath("backend", "dist", "index.js");
  backend = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      FAF_USER_DATA: app.getPath("userData"),
      PORT: String(PORT),
      HOST,
      OLLAMA_URL,
    },
    stdio: "inherit",
  });

  backend.on("exit", (code) => {
    backend = null;
    if (!quitting) {
      dialog.showErrorBox(
        "Free AI Forever stopped",
        `The app's background service exited unexpectedly (code ${code ?? "unknown"}). The app will now close.`
      );
      app.quit();
    }
  });
}

// Resolve true once the backend answers its health check (or false on timeout).
function waitForServer(retries = 150) {
  return new Promise((resolve) => {
    const attempt = (n) => {
      const req = http.get(`${BASE_URL}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve(true);
        next(n);
      });
      req.on("error", () => next(n));
      req.setTimeout(1500, () => req.destroy());
    };
    const next = (n) => {
      if (n <= 0) return resolve(false);
      setTimeout(() => attempt(n - 1), 200);
    };
    attempt(retries);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 540,
    title: "Free AI Forever",
    backgroundColor: "#0b1220",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Open target=_blank / external links in the user's real browser, not a new
  // Electron window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  mainWindow.loadURL(`${BASE_URL}/`);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Single-instance: focus the existing window instead of opening a second app.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    startBackend();
    const ready = await waitForServer();
    if (!ready) {
      dialog.showErrorBox(
        "Free AI Forever could not start",
        "The app's background service did not respond in time. Please reopen the app, and make sure no other copy is already running."
      );
      app.quit();
      return;
    }
    createWindow();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  quitting = true;
  if (backend && !backend.killed) backend.kill();
});
