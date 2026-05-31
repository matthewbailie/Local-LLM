# Local LLM Chat App - Agent Setup Prompt

This file is a master prompt for an AI coding agent (Cursor, or similar). It is not a tutorial you run by hand.

## How to use this prompt

1. Open a fresh agent chat in Cursor on the Mac where you want the app installed.
2. Paste this entire file as your message and send it.
3. Answer the two questions the agent asks (RAM reservation, and a final go-ahead before download).
4. When the agent finishes, follow the run instructions it prints.

Everything below the line is the instruction set for the agent.

---

## Your role

You are a local-LLM setup engineer working on this user's Mac. Your goal is to deliver a working, fully offline chat application backed by a local Ollama model. You will:

- Profile the machine.
- Recommend and confirm how much RAM to leave for other apps.
- Pick the most powerful model the machine can comfortably run, then install it.
- Scaffold and wire up a local chat app (Vite frontend + Node backend).
- Print exact instructions for running the app.

Operate autonomously **except** for two pause points: the RAM reservation question (Phase 1) and the pre-download confirmation (Phase 2). Do not skip those. Otherwise proceed without asking for permission at each step. Show the commands you run and a short result for each phase.

If a step fails, stop, show the error, and propose a fix before continuing. Default to secure, offline, localhost-only behavior.

---

## Phase 0 - Profile the machine (read-only)

Run these and parse the output. Do not modify anything in this phase.

```bash
uname -m                              # arm64 = Apple Silicon, x86_64 = Intel
sysctl -n hw.memsize                  # total RAM in bytes
sysctl -n machdep.cpu.brand_string    # CPU
sysctl -n hw.model                    # model identifier
sw_vers                               # macOS version
df -h /                               # free disk on the system volume
```

Then print a short hardware summary, for example:

```
Detected: Apple Silicon (M-series), 16 GB unified RAM, 120 GB free disk, macOS 15.x
```

Notes for your reasoning:
- On Apple Silicon, RAM is unified memory shared between CPU and GPU (Metal). The model and its context share that pool, so be conservative.
- Total RAM in GB = `hw.memsize` / 1024 / 1024 / 1024.
- A model needs roughly its on-disk size in RAM, plus extra for context. Treat the download size as a rough lower bound on RAM use.

---

## Phase 1 - Ask the RAM reservation (PAUSE for the user)

First compute a recommended reservation for other apps:

- Recommended reserve = max(6 GB, round(30% of total RAM)).
- Model budget = total RAM - reserved.

Example: on a 16 GB Mac, recommended reserve = 6 GB, model budget = 10 GB.

Then ask the user this question and wait for an answer:

> How much RAM do you want to reserve for other apps (browser, editor, etc.), separate from the LLM?
> Based on your machine I recommend reserving **X GB**, which leaves a model budget of **Y GB**. Reply with a number in GB, or "use recommended".

Recompute the model budget from whatever the user chooses. If they reserve so much that the budget drops below ~4 GB, warn them that only small models will fit and ask them to confirm.

---

## Phase 2 - Choose the model, then confirm (PAUSE for the user)

Pick the most capable model that fits the **model budget** from Phase 1. Prefer a vision-capable model so image uploads work; if the budget is too small for vision, pick the best text model and tell the user images will not be supported.

Decision table (Ollama model tags):

| Model budget | Recommended model | Notes |
|---|---|---|
| < 4 GB | `qwen2.5:1.5b` | Text only. Tight; close other apps. |
| 4-6 GB | `qwen2.5:3b` | Text only. Image upload not supported. |
| 6-10 GB | `qwen2.5-vl:7b` (fallback `llama3.2-vision:11b`) | Vision + text. |
| 10-24 GB | `qwen2.5-vl:7b` plus larger text option `qwen2.5:14b` | Vision + strong text. |
| 24-48 GB | `llama3.2-vision:11b` or `qwen2.5-vl:32b` | High quality vision + text. |
| 48 GB+ | `qwen2.5-vl:32b` / `qwen2.5:32b` | Largest comfortable fit. |

Also check free disk from Phase 0: each model download is several GB. If free disk is below the model size + 5 GB, warn and pick a smaller model.

Print your choice with a one-line rationale, for example:

```
Choice: qwen2.5-vl:7b (vision-capable, ~6 GB, fits your 10 GB budget with room for context)
```

Then ask:

> I'm about to download and install **<model>** (~<size> GB) via Ollama. Proceed? (yes / pick a different one)

Wait for confirmation before downloading.

---

## Phase 3 - Install Ollama and pull the model

1. Check whether Ollama is already installed: `command -v ollama`.
2. If missing, install it. Prefer Homebrew:
   - Check Homebrew: `command -v brew`. If Homebrew is missing, install it from the official script at `https://brew.sh` (show the command and run it), or fall back to the official Ollama installer at `https://ollama.com/download`.
   - `brew install ollama`
3. Start the Ollama service in the background: `brew services start ollama` (or `ollama serve &` if not using brew services). Confirm it is reachable: `curl -s http://localhost:11434/api/tags`.
4. Pull the chosen model: `ollama pull <model>`.
5. Smoke test: `ollama run <model> "Reply with the single word: ready"` and confirm a sane response, then exit.

Report success with the installed model name and version.

---

## Phase 4 - Scaffold the app

Create the project in a new folder `local-llm-chat/` in the user's current working directory, with this layout:

```
local-llm-chat/
  frontend/    # Vite + React + TypeScript + Tailwind
  backend/     # Node + Express + TypeScript, better-sqlite3
  workspace/   # sandboxed directory the LLM is allowed to write files into
  package.json # root scripts to run everything together
  README.md
```

### Backend (Node + Express + TypeScript)

Use `better-sqlite3` for storage and `multer` (or equivalent) for uploads. Store the chosen model name in a small config so the app knows which model to call. Endpoints:

- `POST /api/chat` - accepts `{ chatId, messages }`, streams the response from Ollama's `http://localhost:11434/api/chat` (set `stream: true`) back to the client. Persist the user message and the final assistant message.
- `GET /api/chats` - list chats (id, title, pinned, updated_at), pinned first then most-recent.
- `POST /api/chats` - create a new chat.
- `GET /api/chats/:id` - fetch a chat with its messages.
- `PATCH /api/chats/:id` - rename and/or set pinned.
- `DELETE /api/chats/:id` - delete a chat and its messages.
- `POST /api/upload` - accept files and images. For images, convert to base64 and pass them in the `images` field of the Ollama chat message (vision models). For text files, read and include the content as context. Reject unexpected/oversized files.
- `POST /api/files/write` - write a file the LLM produced. **Only** allowed inside `workspace/`: resolve the final path and verify it stays within `workspace/` (reject any `..` traversal or absolute paths). Never write outside it.
- `GET /api/models` - list locally installed Ollama models so the UI can offer a model selector.
- `GET /api/models/available` - return a curated catalog of LLMs the user can download, each with: model tag, short description, download size, approximate RAM requirement, whether it is vision-capable, and a `fits` flag computed against the machine's model budget (RAM from Phase 1, free disk from Phase 0). Mark models already installed.
- `POST /api/models/pull` - run `ollama pull <model>` for a model from the catalog and stream download progress back to the client (parse Ollama's pull progress JSON). On completion the model becomes available in `GET /api/models`.
- `DELETE /api/models/:tag` - remove a locally installed model (`ollama rm <tag>`) to free disk.

SQLite schema:

```sql
CREATE TABLE chats (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE messages (
  id          TEXT PRIMARY KEY,
  chat_id     TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,          -- 'user' | 'assistant' | 'system'
  content     TEXT NOT NULL,
  attachments TEXT,                   -- JSON array of file metadata
  created_at  INTEGER NOT NULL
);
```

### Frontend (Vite + React + TypeScript + Tailwind)

- Two-pane layout: a left history sidebar, a right chat panel.
- Talk to the backend (not Ollama directly) so streaming, persistence, uploads, and file writes all work.
- Render assistant messages as markdown with syntax-highlighted code blocks.
- Stream tokens into the UI as they arrive.

**Model library ("Check for new LLMs")**
- A menu/button in the app (e.g. in the header or settings) labeled "Check for new LLMs" opens a model library panel.
- The panel calls `GET /api/models/available` and shows each downloadable LLM as a card with: name, description, download size, RAM requirement, vision support, and a clear indicator of whether it fits this machine (and whether it is already installed).
- Each not-yet-installed model has a Download button that calls `POST /api/models/pull` and shows live download progress (progress bar / percentage). On completion the model appears in the model dropdown automatically.
- Installed models can be removed to free disk (`DELETE /api/models/:tag`), with a confirmation step.

**Model dropdown below the chat box**
- Directly below the chat input, show a dropdown listing the locally installed models (from `GET /api/models`). Selecting one sets the active model for the current chat. Show the active model name at all times.

**Chat input box**
- Auto-expanding textarea: grows with content up to a maximum of 15 lines, then becomes internally scrollable instead of growing further.
- Enter sends the message; Shift+Enter inserts a newline. Disable send while a response is streaming (show the stop-generation control instead).

**Layout and UI quality**
- Responsive: works from a narrow window up to wide desktop. On narrow widths the history sidebar collapses behind a toggle; the chat panel and input stay usable.
- Clean UI guidelines: consistent spacing scale, readable line length for messages, clear visual hierarchy, accessible color contrast, visible focus states, keyboard navigation for the sidebar and menus, and a light/dark theme that respects the OS preference.

---

## Phase 5 - Required feature spec (acceptance criteria)

The app must satisfy all of the following. Treat this as your checklist before declaring done.

**Chat**
- [ ] Send a prompt and get a streamed response from the local model.
- [ ] Stop-generation button that cancels an in-flight response.
- [ ] Copy button on each message.
- [ ] Markdown rendering with code syntax highlighting.

**History**
- [ ] Multiple chats persisted across restarts (SQLite).
- [ ] Sidebar lists chats; pinned chats sorted to the top, then most-recently updated.
- [ ] "New chat" button.
- [ ] Search/filter chats by title.
- [ ] Auto-generate a chat title from the first user message.

**Right-click context menu on a history item**
- [ ] Pin / Unpin.
- [ ] Rename (inline edit).
- [ ] Delete (with a confirmation step).

**Files and images**
- [ ] Upload one or more files/images in a message.
- [ ] Images are sent to the vision model and influence the response.
- [ ] Text files are included as context.
- [ ] The user can ask the model to write a file; the file is saved **only** inside `workspace/`, with path-traversal protection and localhost-only access.

**Model library (check for new LLMs)**
- [ ] A "Check for new LLMs" menu opens a panel listing downloadable models with description, download size, and RAM/system requirements.
- [ ] Each model shows whether it fits this machine and whether it is already installed.
- [ ] Download button pulls the model with live progress; on completion it is connected to the app and selectable.
- [ ] Installed models can be removed (with confirmation) to free disk.

**Model selection**
- [ ] A dropdown directly below the chat box lists locally installed models; selecting one sets the active model for the chat.

**Chat input**
- [ ] Input textarea auto-expands up to 15 lines, then scrolls internally.
- [ ] Enter sends; Shift+Enter adds a newline.

**Layout and UI**
- [ ] Responsive from narrow window to wide desktop; sidebar collapses behind a toggle on small widths.
- [ ] Clean UI: consistent spacing, clear hierarchy, accessible contrast, visible focus states, light/dark theme following the OS preference.

**Settings**
- [ ] Editable system prompt and temperature.

**Offline**
- [ ] After setup, the app works fully offline at runtime. Note the one exception: the "Check for new LLMs" download feature requires internet to pull a new model from the Ollama registry; everything else (chat, history, uploads) works offline.

---

## Phase 6 - Print run instructions

Add root `package.json` scripts so the whole thing starts with one command (use `concurrently` to run backend and frontend together). After everything is built and verified, print run instructions to the user, like:

```
Your local LLM chat app is ready.

1. Make sure Ollama is running:
   brew services start ollama   (or: ollama serve)

2. From the local-llm-chat/ folder, install dependencies once:
   npm install

3. Start the app:
   npm run dev

4. Open the app in your browser:
   http://localhost:5173

Troubleshooting:
- "Cannot reach the model": confirm Ollama is up with `curl http://localhost:11434/api/tags`.
- "Model not found": run `ollama pull <model>`.
- "Port in use": stop the other process or change the port in the config.
```

Replace the model name, ports, and paths with the real values you used.

---

## Constraints

- Localhost only. The backend binds to `127.0.0.1`; no external services at runtime.
- No secrets or API keys anywhere (Ollama is local and needs none). Do not hardcode credentials.
- Validate all inputs on the backend: file size and type limits on uploads, JSON shape checks on chat requests.
- Sandbox all file writes to `workspace/`. Reject absolute paths and `..` traversal; resolve and verify the final path is inside `workspace/` before writing.
- Fail securely: on error, return a safe message and never expose stack traces or filesystem paths to the client.
- Honor the two pause points (RAM reservation, pre-download confirmation). Otherwise proceed autonomously and report progress per phase.
