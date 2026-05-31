# Free AI Forever - your free, agentic AI

A free, local AI chat app you own forever - no subscriptions, no API keys. The model runs on your own computer via [Ollama](https://ollama.com), and the app gives it tools so it can behave like Claude or Cursor: it can **search the web** and **read, write, and create files** on your computer (inside a folder you control).

There are two ways to get it:

1. **Download the app** (easiest, no setup) - a normal desktop app you install and double-click. No Node.js, no terminal.
2. **Run from source** (for developers) - clone the repo and run it with Node.

---

## 1. Download the app (recommended)

Go to the [**Releases**](../../releases/latest) page and download the installer for your computer:

| Your computer | Download |
|---|---|
| **Mac** (Apple Silicon - M1/M2/M3/M4) | `Free AI Forever-<version>-arm64.dmg` |
| **Mac** (Intel) | `Free AI Forever-<version>-x64.dmg` |
| **Windows** (64-bit) | `Free AI Forever-<version>-x64.exe` |

Then:

1. **Install Ollama** (free, one time): get it from [ollama.com/download](https://ollama.com/download) and open it once so it starts running. This is what actually runs the AI models; Free AI Forever talks to it. The app reminds you if it isn't running.
2. **Install Free AI Forever:**
   - **Mac:** open the `.dmg` and drag **Free AI Forever** into Applications. The first time you open it, macOS may say it's from an unidentified developer - right-click the app, choose **Open**, then **Open** again (one time only). *(The app is not code-signed yet, so this is expected.)*
   - **Windows:** run the `.exe`. If you see "Windows protected your PC", click **More info** then **Run anyway** (one time only).
3. **Open the app.** The first time, it walks you through the rest: if Ollama isn't running it shows a Download Ollama button and waits for it, then it offers a recommended first model (one that fits your computer's memory) to download with one click. After that you're chatting.

That's it - no Node.js, no terminal, no build step. The app bundles its own runtime.

> **Why is Ollama separate?** Ollama is a system service that runs the AI models and manages gigabytes of model files. It installs once and is shared by anything on your machine that uses local models, so it can't be embedded inside this app.

---

## 2. Run from source (developers)

Requires [Node.js](https://nodejs.org) (LTS) and [Ollama](https://ollama.com). Then:

```bash
git clone <this-repo-url>
cd Free-AI-Forever
npm install      # installs root, backend, and frontend deps
npm run dev      # starts backend + frontend; open the printed URL
```

Or, instead of `npm run dev`, double-click the one-click launcher in the project folder:

- **macOS:** `Free AI Forever.command`
- **Windows:** `Free AI Forever.bat`

The launcher installs/builds on first run, starts the single-port server, and opens the app in its own window. Keep the small terminal window it opens running while you use the app; closing it stops the app. The launcher needs Node.js; if it's missing, it tells you where to get it.

### Build a desktop installer yourself

```bash
npm run dist:mac    # builds release/Free AI Forever-<version>-<arch>.dmg  (run on a Mac)
npm run dist:win    # builds release/Free AI Forever-<version>-x64.exe     (run on Windows)
```

Native installers can only be built on their own OS (the `better-sqlite3` native module can't be cross-compiled reliably). The committed GitHub Actions workflow builds all three on the right runners for you (see below).

---

## How it's built (desktop app architecture)

- **Frontend:** Vite + React + TypeScript + Tailwind, built to `frontend/dist`.
- **Backend:** Node + Express + TypeScript with SQLite (`better-sqlite3`); serves both the API and the built frontend on one local port (`127.0.0.1` only).
- **Desktop shell:** Electron. It ships its own Node runtime, launches the compiled backend with that runtime (so end users need no Node install), and loads the app in a window. All writable state (settings, database, uploads, agent workspace) lives in the per-user app-data folder, not inside the read-only app bundle.
- **Packaging:** `electron-builder` produces the `.dmg`/`.exe`. The build is currently **unsigned** (users click past the one-time Gatekeeper / SmartScreen prompt).

## Features

- Streamed responses from the local model, with a stop button. Queue follow-up messages while it's replying.
- Agentic tools: the model can search the web, fetch a URL, and list/read/write/create/delete files via Ollama tool calling. Web answers show source links; web requests are SSRF-protected.
- File access like Cursor/Claude: read/list files anywhere (except protected system folders); writes/creates run automatically inside the agent working directory, while writing outside it or any delete needs your approval (with the full path and a preview).
- Multiple chats in SQLite; pin, rename, fork, delete (from a hover menu or right-click). Per-message copy, revert, and fork. Search across titles and message text.
- Markdown rendering with syntax-highlighted code. Attach files/images by picker, drag-and-drop, or paste.
- **Manage LLMs:** live catalog showing which models fit your RAM budget, Latest badges, and tool/vision indicators; download with progress; remove to free disk.
- Model dropdown to switch models; models that don't fit your RAM budget are greyed out.
- LLM on/off toggle to load/unload the model from memory (without uninstalling), with an explainer popup; auto-reloads on the next message.
- Light/dark theme that follows your OS by default; responsive layout with an animated collapsing sidebar.
- A plain-language **How to** help panel covering every feature.

## Project layout

```
Free-AI-Forever/
  frontend/                   # Vite + React + TypeScript + Tailwind
  backend/                    # Node + Express + TypeScript, better-sqlite3, agent tools
  electron/                   # Electron main process (desktop shell)
  build/                      # icon.png + macOS entitlements for packaging
  scripts/make-icon.mjs       # regenerates build/icon.png from frontend/public/icon.svg
  workspace/                  # default agent working directory (change it in Settings)
  launch.mjs                  # one-click launcher for the source version
  Free AI Forever.command     # macOS double-click launcher (source version)
  Free AI Forever.bat         # Windows double-click launcher (source version)
  .github/workflows/build.yml # CI: builds + publishes installers on a release tag
  package.json                # root scripts + electron-builder config
```

## Releasing new versions (maintainer)

Installers are built and published automatically by GitHub Actions. To cut a release:

1. Bump the version in `package.json` (e.g. `1.0.1`).
2. Commit and push to GitHub.
3. Tag the release and push the tag:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
4. The **Build desktop installers** workflow runs on macOS (Apple Silicon + Intel) and Windows, then creates a GitHub Release for that tag with all three installers attached. Watch progress on the **Actions** tab; the Release appears on the **Releases** page when it finishes.

You can also trigger the workflow manually from the **Actions** tab (**Run workflow**) to produce installers without creating a release. If you change the logo, run `npm run icon` and commit the updated `build/icon.png`.

## Security and network notes

- The server binds to `127.0.0.1`; the UI is not exposed on your network.
- No hardcoded secrets. An optional search provider key (Tavily) is read from the `TAVILY_API_KEY` environment variable or a git-ignored local file; keyless DuckDuckGo is used otherwise.
- Web access (fetch + search) is SSRF-protected: http/https only; loopback, private, link-local, and cloud-metadata addresses are blocked, with host re-checks on redirects and size/time caps.
- Filesystem actions are path-confined: no `..` traversal, no symlink escapes, never into system directories. Outside the working directory and all deletes require explicit approval.
- The model runs locally, so plain chat works on your machine. Features that need the internet: web search, URL fetch, and downloading a new model. No analytics or third-party data is sent.

## Troubleshooting

- **"Cannot reach the model" / "Ollama is not reachable":** open the Ollama app (or run `ollama serve`), then try again. Confirm it's up with `curl http://localhost:11434/api/tags`.
- **No models to choose / chat does nothing:** open **Manage LLMs** and download a model first. Click **Refresh** if the list is empty.
- **"This model does not support tools":** switch to a tool-capable model (e.g. a `qwen2.5` model) to enable web search and file actions. Vision-only models like `llama3.2-vision` can't call tools.
- **The AI gives stale/made-up answers to "current" questions:** make sure the active model is tool-capable and Web search is on in Settings. Don't edit the system prompt to claim it has no internet - that suppresses tool use.
- **macOS won't open the app ("unidentified developer"):** right-click the app → **Open** → **Open**. This is the one-time Gatekeeper prompt for an unsigned app.
- **Running from source: `ENOENT: Could not read package.json`:** you ran `npm run dev` outside the project folder. `cd` into `Free-AI-Forever` first, or use the double-click launcher.
