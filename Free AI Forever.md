# Free AI Forever

A master prompt for an AI coding agent that sets up a free, locally running AI chat app you own forever - no subscriptions, no API keys.

## How to use this prompt

Works in any agentic AI coding tool that can run terminal commands and edit files on your computer - for example Cursor, Claude Code, Windsurf, Cline, Aider, or GitHub Copilot agent mode. It will not work in a plain chat that cannot run commands on your machine (such as the Claude.ai or ChatGPT websites), because it needs to detect your specs, install software, and create files.

1. Open a fresh agent chat in your AI coding tool, in agent mode (the mode that can run commands and edit files), on the Mac or Windows PC where you want the app installed.
2. Paste this entire file as your message and send it.
3. Answer the two questions the agent asks (RAM reservation, and a final go-ahead before download).
4. When the agent finishes, follow the run instructions it prints.

Everything below the line is the instruction set for the agent.

---

## Your role

You are a local-LLM setup engineer working on this user's computer, which runs **macOS or Windows**. Your goal is to deliver a working **agentic** chat application backed by a local Ollama model. The model runs locally, but the app gives it tools so it can behave like Claude or Cursor: it can **search the web** and **read, write, and create files and folders on the user's computer**. You will:

- Detect the operating system, then profile the machine.
- Recommend and confirm how much RAM to leave for other apps.
- Pick the most powerful **tool-capable** model the machine can comfortably run, then install it.
- Scaffold and wire up a local chat app (Vite frontend + Node backend) with web-search and filesystem tools.
- Print exact instructions for running the app.

Operate autonomously **except** for two pause points: the RAM reservation question (Phase 1) and the pre-download confirmation (Phase 2). Do not skip those. Otherwise proceed without asking for permission at each step. Show the commands you run and a short result for each phase.

If a step fails, stop, show the error, and propose a fix before continuing. The model itself stays local; web search and direct hard-drive read/write are real side effects, so build them with the safeguards described in the Constraints section (read anywhere except system folders, approval before writing/deleting outside the working folder, SSRF protection on web requests).

---

## Phase 0 - Detect the OS and profile the machine (read-only)

First detect the operating system, then run the matching commands. Do not modify anything in this phase. Use the OS you detect to choose the right commands in every later phase too (install, service start, run instructions).

**On macOS** (shell / Terminal):

```bash
uname -m                              # arm64 = Apple Silicon, x86_64 = Intel
sysctl -n hw.memsize                  # total RAM in bytes
sysctl -n machdep.cpu.brand_string    # CPU
sysctl -n hw.model                    # model identifier
sw_vers                               # macOS version
df -h /                               # free disk on the system volume
```

**On Windows** (PowerShell):

```powershell
(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory          # total RAM in bytes
(Get-CimInstance Win32_Processor).Name                              # CPU
(Get-CimInstance Win32_VideoController) | Select Name, AdapterRAM   # GPU and VRAM
(Get-CimInstance Win32_OperatingSystem).Caption                     # Windows version
Get-PSDrive C | Select Used, Free                                   # free disk on C:
```

Then print a short hardware summary, for example:

```
Detected: Apple Silicon (M-series), 16 GB unified RAM, 120 GB free disk, macOS 15.x
```

or

```
Detected: Windows 11, Intel Core i7, 32 GB RAM, NVIDIA RTX 4060 (8 GB VRAM), 300 GB free disk
```

Notes for your reasoning:

- On Apple Silicon, RAM is unified memory shared between CPU and GPU (Metal). The model and its context share that pool, so be conservative.
- On Windows with a dedicated GPU, Ollama can offload to GPU VRAM; models up to roughly the VRAM size run fastest, and larger models spill to system RAM (slower). With only integrated graphics, treat it like CPU-only and size against system RAM.
- Total RAM in GB = total bytes / 1024 / 1024 / 1024.
- A model needs roughly its on-disk size in RAM (or VRAM), plus extra for context. Treat the download size as a rough lower bound on memory use.

---

## Phase 1 - Ask the RAM reservation (PAUSE for the user)

First compute a recommended reservation for other apps:

- Recommended reserve = max(6 GB, round(30% of total RAM)).
- Model budget = total RAM - reserved. (This same number is called the "LLM budget" in Settings and the model-library endpoint.)

Example: on a 16 GB machine, recommended reserve = 6 GB, model budget = 10 GB.

Then ask the user this question and wait for an answer:

> How much RAM do you want to reserve for other apps (browser, editor, etc.), separate from the LLM? Based on your machine I recommend reserving **X GB**, which leaves a model budget of **Y GB**. Reply with a number in GB, or "use recommended".

Recompute the model budget from whatever the user chooses. If they reserve so much that the budget drops below ~4 GB, warn them that only small models will fit and ask them to confirm.

---

## Phase 2 - Choose the model, then confirm (PAUSE for the user)

Pick the most capable model that fits the **model budget** from Phase 1. Two capabilities matter for this app:

- **Tool calling** (required for web search and filesystem actions). Prefer a model that supports Ollama tool calling, such as the `qwen2.5` family or `llama3.1`/`llama3.2`. Without tool calling the agentic features will not work.
- **Vision** (so image uploads work). Vision models like `qwen2.5-vl` and `llama3.2-vision` handle images.

Some models do both; some do not. If a single model in budget cannot do both well, default to a tool-capable text model (the agentic web + file features are the priority for this build) and tell the user that image understanding may be limited. You may also install two models (one tool-capable text model, one vision model) if disk and budget allow, and let the user switch between them in the dropdown.

Important: the **default/active model must be tool-capable**, otherwise web search and file actions silently do nothing. Note that `llama3.2-vision` does **not** support Ollama tool calling - do not make a non-tool model the default. If you install a vision-only model for images, still install a tool-capable text model and make that the default active model, and warn the user that web/file features only work while a tool-capable model is selected. When the active model lacks tool calling, the UI must clearly say so and offer to switch.

Decision table (Ollama model tags):


| Model budget | Recommended model                                     | Notes                                  |
| ------------ | ----------------------------------------------------- | -------------------------------------- |
| < 4 GB       | `qwen2.5:1.5b`                                        | Text only. Tight; close other apps.    |
| 4-6 GB       | `qwen2.5:3b`                                          | Text only. Image upload not supported. |
| 6-10 GB      | `qwen2.5-vl:7b` (fallback `llama3.2-vision:11b`)      | Vision + text. `qwen2.5-vl` has tools; the `llama3.2-vision` fallback does not. |
| 10-24 GB     | `qwen2.5-vl:7b` plus larger text option `qwen2.5:14b` | Vision + strong text.                  |
| 24-48 GB     | `qwen2.5-vl:32b` (vision + tools) or `llama3.2-vision:11b` | High quality. `llama3.2-vision` has no tool calling, so keep a tool-capable default. |
| 48 GB+       | `qwen2.5-vl:32b` / `qwen2.5:32b`                      | Largest comfortable fit.               |


Also check free disk from Phase 0: each model download is several GB. If free disk is below the model size + 5 GB, warn and pick a smaller model.

Print your choice with a one-line rationale, for example:

```
Choice: qwen2.5-vl:7b (vision-capable, ~6 GB, fits your 10 GB budget with room for context)
```

Then ask:

> I'm about to download and install **<model>** (~<size> GB) via Ollama. Proceed? (yes / pick a different one)

Wait for confirmation before downloading.

---

## Phase 3 - Install prerequisites (Ollama, Node.js) and pull the model

Use the install path for the OS detected in Phase 0.

1. Check whether Ollama is already installed: `ollama --version` (or `command -v ollama` on macOS / `Get-Command ollama` on Windows).
2. If missing, install it:
   - **macOS:** prefer Homebrew. Check `command -v brew`; if Homebrew is missing, install it from the official script at `https://brew.sh` (show the command and run it), then `brew install ollama`. Fallback: the official installer at `https://ollama.com/download`.
   - **Windows:** prefer winget: `winget install Ollama.Ollama`. Fallback: download and run the official installer (`OllamaSetup.exe`) from `https://ollama.com/download`.
3. Install Node.js (the app needs it; the user may not have it). Check `node --version` and require Node.js 20 LTS or newer. If missing or older:
   - **macOS:** `brew install node` (or the official installer at `https://nodejs.org`).
   - **Windows:** `winget install OpenJS.NodeJS.LTS` (or the official installer at `https://nodejs.org`).
   - Confirm both `node --version` and `npm --version` work afterward.
4. Start the Ollama service:
   - **macOS:** `brew services start ollama` (or `ollama serve &`).
   - **Windows:** the installer registers Ollama as a background service that starts automatically; if it is not running, launch the Ollama app or run `ollama serve` in a separate window.
   - Confirm it is reachable on both: `curl http://localhost:11434/api/tags` (PowerShell also supports `curl`, or use `Invoke-RestMethod http://localhost:11434/api/tags`).
5. Pull the chosen model: `ollama pull <model>` (same on both OSes).
6. Smoke test: `ollama run <model> "Reply with the single word: ready"` and confirm a sane response, then exit.

Report success with the installed Ollama version, Node.js version, and model name. Note how you started Ollama (menu-bar app vs `ollama serve` / `brew services`) so the run instructions in Phase 6 match the real setup.

---

## Phase 4 - Scaffold the app

Create the project in a new folder `Free-AI-Forever/` in the user's current working directory, with this layout:

```
Free-AI-Forever/
  frontend/                  # Vite + React + TypeScript + Tailwind
  backend/                   # Node + Express + TypeScript, better-sqlite3
  workspace/                 # default agent working directory (read/write); user can point this elsewhere
  launch.mjs                 # one-click launcher: build-if-needed, start server, open app window
  Free AI Forever.command    # macOS double-click launcher (runs launch.mjs)
  Free AI Forever.bat        # Windows double-click launcher (runs launch.mjs)
  package.json               # root scripts to run everything together
  README.md
```

The app can read and write files directly on the computer's hard drive, like Cursor or Claude. The **agent working directory** is the model's auto-approve zone, not a sandbox: it defaults to `workspace/` but the user can point it at any real folder. Reading and listing files works **anywhere on disk** (except protected OS/system folders). Writing, creating, and deleting also work anywhere, but outside the working directory they require explicit user approval first; inside it they happen automatically. Deletes always ask. Protected system directories are never writable (see Constraints).

### Backend (Node + Express + TypeScript)

Use `better-sqlite3` for storage and `multer` (or equivalent) for uploads. Store the chosen model name in a small config so the app knows which model to call. Endpoints:

- `POST /api/chat` - accepts `{ chatId, model, userMessage }` where `userMessage` carries the text plus any image (base64) and text-file attachments. Rebuild the conversation from stored history, then run the **agentic tool-calling loop** (see "Agent tools" below) against Ollama's `http://localhost:11434/api/chat`, streaming the final answer tokens plus tool-activity events back to the client. Persist the user message and the final assistant message.
- `GET /api/chats` - list chats (id, title, pinned, updated_at), pinned first then most-recent.
- `GET /api/chats/search?q=<term>` - search chats by **both the chat title and the message content**, returning the matching chat summaries (pinned first, then most recent), each with an optional snippet of the matching message text when the match was in the body. Use a parameterized SQL `LIKE` query (escape `%`/`_` wildcards) against `chats.title` and `messages.content` - never build SQL by string concatenation. Register this route **before** `/:id` so it is not treated as a chat id.
- `POST /api/chats` - create a new chat.
- `GET /api/chats/:id` - fetch a chat with its messages.
- `PATCH /api/chats/:id` - rename and/or set pinned.
- `DELETE /api/chats/:id` - delete a chat and its messages.
- `POST /api/chats/:id/fork` - `{ messageId? }` -> create a **new** chat that copies this chat's message history **up to and including** the given message (or the whole chat when `messageId` is omitted), and return the new chat summary. The original chat is unchanged. Copy attachments/sources as stored; assign fresh message ids; title the new chat `"<original title> (fork)"`.
- `POST /api/chats/:id/revert` - `{ messageId }` -> **revert** the chat to that message by deleting every message after it (the given message is kept). Returns the updated chat with its remaining messages. This is destructive, so the UI confirms first.
- Note: `GET /api/chats/:id` returns each message with its real id plus `attachments` (user files) and `sources` (assistant web citations) decoded from storage, so the per-message actions and citations survive a reload.
- `POST /api/upload` - accept files and images. For images, convert to base64 and pass them in the `images` field of the Ollama chat message (vision models). For text files, read and include the content as context. Reject unexpected/oversized files.
- `GET /api/models` - list locally installed Ollama models so the UI can offer a model selector. For each model include an estimated **RAM requirement** (from the catalog when the tag is known, otherwise approximated from the on-disk size plus context headroom) and a **tool-calling / internet capability** flag, so the selector can grey out models that exceed the current LLM budget and the library can mark which models reach the internet.

**Agent tool endpoints** (these are the side-effecting capabilities; each enforces the safeguards in Constraints):

- `POST /api/tools/web-search` - `{ query }` -> a list of results (title, url, snippet). Use a keyless provider by default (for example the DuckDuckGo HTML/Lite endpoint or a self-hosted SearXNG). Optionally support a pluggable provider (Brave Search, Tavily, Serper) whose API key comes from an environment variable, never hardcoded.
- `POST /api/tools/fetch-url` - `{ url }` -> readable text/markdown extracted from the page (strip scripts/markup). Apply SSRF protection (see Constraints): https/http only, block private/loopback/link-local/metadata addresses, cap response size and time.
- `POST /api/tools/fs/list` - `{ path }` -> directory entries for any folder on disk (relative to the working directory, or an absolute path), except protected system folders.
- `POST /api/tools/fs/read` - `{ path }` -> file contents for any file on disk (relative or absolute), except protected system folders.
- `POST /api/tools/fs/write` - `{ path, content }` -> write/overwrite a file anywhere on disk (relative or absolute). Allowed without prompting inside the agent working directory; outside it, require an explicit `approved: true` flag set by a user confirmation in the UI. Return the absolute path written.
- `POST /api/tools/fs/mkdir` - `{ path }` -> create a folder anywhere on disk (same approval rules as write).
- `POST /api/tools/fs/delete` - `{ path }` -> delete a file/folder. Always requires user confirmation, even inside the working directory.

All `fs/*` endpoints resolve the real path (following symlinks), reject `..` traversal in relative paths and block OS/system directories entirely, and use Node's `path` utilities so they behave correctly on macOS and Windows. Absolute paths to ordinary user locations (Desktop, Documents, project folders, etc.) are allowed so the app can work with files directly on the hard drive.

The model-management endpoints follow:

- `GET /api/models/available?reservedRamGb=<n>&refresh=<true|false>` - return the catalog of LLMs the user can download, each with: model tag, short description, download size, approximate RAM requirement, whether it is vision-capable, whether it supports tool calling, a **`family`** label (the model brand, e.g. "Qwen", "Llama", "Mistral"), an `installed` flag, an `isLatest` flag (see below), a `discovered` flag (true for models found via the internet rather than the bundled catalog), and a `fits` flag. Compute `fits` against the **LLM budget = total RAM - reservedRamGb** (the value comes from the Settings slider; fall back to the Phase 1 value if omitted) and the free disk from Phase 0. The handler reads current installed models each call so the response is live.
   - **`isLatest` is computed per family, not globally.** Group all models (curated + discovered) by `family` and mark exactly **one** model as `isLatest` in each family - the newest version, breaking ties by the larger model. So the list has one "Latest" highlight for Qwen, one for Llama, one for each other family, rather than a single global latest. Derive the family from the leading letters of the tag (`qwen2.5-vl:32b` and `qwen2.5:32b` are both "Qwen"; `llama3.2:3b` and `llama3.2-vision:11b` are both "Llama") and the version from the first number in the tag.
   - Discovered models may have unknown download size and RAM (the registry does not always expose them); represent these as `0` and treat them as fitting, and have the UI show "size varies" instead of "0 GB".
   - The catalog is **kept up to date from the internet**: the handler queries an upstream model source (the Ollama model library, or a maintained remote JSON manifest of models) to discover newly released models, merges them with the bundled curated catalog, dedupes by model tag, and returns the combined list. Each entry should note whether it came from the live source.
   - **Only surface models that can actually be pulled and run locally.** Many entries in the Ollama library are **cloud-only** (for example `deepseek-v4-flash`, `glm-5`, `kimi-k2`, `minimax-m2`, `gemini-3-flash-preview`): their library card has a `cloud` capability badge and **no downloadable size** (`x-test-size`), and `ollama pull` rejects them with `pull model manifest: file does not exist`. When discovering, parse each model card and **skip any model that exposes no local download size or is marked cloud-only.** Otherwise the user clicks Download on a model that can never install. (Do not just match every `/library/<slug>` link.)
   - Cache the upstream result in memory with a short TTL (for example 6 hours) so opening the panel is fast and works without a network round-trip every time. `refresh=true` **bypasses the cache** and forces a fresh internet query (used by the Refresh button).
   - If the upstream query fails or the machine is offline, fall back to the cached result, then to the bundled curated catalog, and include a flag/field indicating the list may be stale so the UI can surface it. Never error out just because the internet is unreachable.
   - **Ship a broad default catalog so the list is useful before any refresh.** The bundled catalog must cover the popular open-source families across a range of sizes, including at least: **Qwen, Llama, Mistral, DeepSeek, Gemma, GLM, Granite, Nemotron, and LFM** (plus vision-capable options such as Qwen-VL and Gemma 3). This way the Model library and the "Model type" filter are populated immediately on first open, and `refresh=true` adds anything newer from the internet.
- `POST /api/models/pull` - run `ollama pull <model>` and stream download progress back to the client (parse Ollama's pull progress JSON). Accept **any model the server recognises** - both bundled-catalog models and models found via the internet discovery/refresh - so newly discovered models can be installed too. Validate the tag against the known set (catalog + cached discovered) and a safe character allowlist before pulling; never pass arbitrary unvalidated input to the registry. On completion the model becomes available in `GET /api/models`.
   - **Detect in-stream pull errors.** Ollama's pull endpoint returns HTTP 200 even when a pull fails, emitting a line like `{"error":"pull model manifest: file does not exist"}` (typical for a cloud-only model or a bad tag). Watch the streamed lines for an `error` field and treat it as a **failure** - do not append a `success` line afterward. Return a clear, actionable message (for example: "This model can't be downloaded to run locally - pick a model that lists a size") so the UI can show it. A pull is only "done" when the stream completes without an error line.
- `DELETE /api/models/:tag` - remove a locally installed model (`ollama rm <tag>`) to free disk.

**Model runtime (load / unload RAM)** - Ollama keeps a model in memory after use, which can consume several GB even when you are not chatting. Let the user free that RAM without uninstalling the model:

- `GET /api/models/runtime` - return whether a model is currently loaded in memory (`loaded: true/false`, which model tag, approximate size if available). Use Ollama's `ollama ps` or `GET /api/ps`.
- `POST /api/models/unload` - unload the active model (or all loaded models) from RAM via `ollama stop <model>`. Ollama stays running; only the in-memory weights are released. Return the freed state.
- `POST /api/models/load` - load/warm up a model into memory without a chat message: send a minimal request to Ollama's `/api/chat` (or `/api/generate`) with `keep_alive` set so the model stays resident. Used when the LLM toggle is switched on and when starting a new chat. Return the loaded state.
- The first message after unload also reloads the model automatically (expect a short delay on that reply).

### Frontend API client - exact URL contract (do not infer paths)

The frontend `api.ts` must call these **exact** URLs and methods. Do not infer paths from function names - a function called `getModelRuntime` does **not** live at `/api/runtime`, it lives at `/api/models/runtime`. Mismatched paths return 404s, which silently make the app think there are no models (forcing the onboarding overlay to show forever) or break chat. Match this table verbatim:

| Frontend function | Method | Exact URL |
| ----------------- | ------ | --------- |
| `fetchInstalledModels` | GET | `/api/models` |
| `fetchAvailableModels` | GET | `/api/models/available?reservedRamGb=<n>&refresh=<true\|false>` |
| `pullModel` | POST | `/api/models/pull` |
| `deleteModel(tag)` | DELETE | `/api/models/:tag` (tag in the URL path, **not** the body) |
| `getModelRuntime` | GET | `/api/models/runtime` |
| `loadModel` | POST | `/api/models/load` |
| `unloadModel` | POST | `/api/models/unload` |
| `fetchSettings` | GET | `/api/settings` |
| `updateSettings` | PATCH | `/api/settings` |
| `fetchChats` | GET | `/api/chats` |
| `searchChats(q)` | GET | `/api/chats/search?q=<term>` |
| `createChat` | POST | `/api/chats` |
| `getChat(id)` | GET | `/api/chats/:id` |
| `updateChat(id)` | PATCH | `/api/chats/:id` |
| `deleteChat(id)` | DELETE | `/api/chats/:id` |
| `forkChat(id)` | POST | `/api/chats/:id/fork` |
| `revertChat(id)` | POST | `/api/chats/:id/revert` |
| `streamChat` | POST | `/api/chat` |
| `uploadFiles` | POST | `/api/upload` |

If you split the frontend and backend across separate build passes or agents, give **both** passes this table so the client and server agree on every route. After wiring `api.ts`, sanity-check each endpoint actually responds (curl or a quick fetch) before declaring done - a 404 here is the single most common reason the app renders only the onboarding screen.

### Chat streaming event shapes (exact field names)

The `POST /api/chat` SSE stream emits newline-delimited `data: <json>` events. The frontend must read these **exact** field names. The token delta is carried in `content`, **not** `delta` - reading the wrong field means the assistant reply renders as an empty window even though the backend streamed text correctly:

- Token: `{ "type": "token", "content": "<delta text>" }` - append `event.content` to the current assistant message.
- Tool start: `{ "type": "tool_start", "tool": "<name>", "target": "<query/path>" }`
- Tool end: `{ "type": "tool_end", "tool": "<name>", "result": "<short result>" }`
- Approval required: `{ "type": "approval_required", "tool": "<name>", "target": "<full path>", "approvalId": "<id>", "content"?: "<preview>" }`
- Warning: `{ "type": "warning", "message": "<text>" }` (for example, the active model lacks tool calling)
- Done: `{ "type": "done", "sources": [...], "messageId": "<id>" }`
- Error: `{ "type": "error", "message": "<text>" }`

Keep the backend emitter and the frontend reader in agreement on these names. If you change a field name on one side, change it on the other in the same pass.

### Agent tools (web search + filesystem) - how the loop works

The chat endpoint is agentic. On each turn:

1. Send the conversation to Ollama's `/api/chat` with a `tools` array declaring the available tools (Ollama tool-calling / JSON schema format). Declare at least: `web_search`, `fetch_url`, `list_directory`, `read_file`, `write_file`, `create_folder`, `delete_path`.
2. If the model responds with `message.tool_calls`, execute each call by routing it to the matching `/api/tools/...` handler. Stream a tool-activity event to the client for each (for example: "Searching the web for ...", "Reading workspace/notes.md", "Wrote app/index.html").
3. Append each tool result to the conversation as a `role: "tool"` message and call the model again.
4. Repeat until the model returns a normal assistant message with no tool calls, or until a safety cap (for example 8 tool rounds) is reached. Then stream the final answer tokens.
5. For web search, encourage the model to cite the source URLs it used so the UI can show them.

Note on streaming vs tool calls: some Ollama versions/models return tool calls reliably only in non-streamed responses. A robust approach is to run the tool-decision turns **without** streaming (read the full response, check for `tool_calls`), and switch to `stream: true` only for the final turn that produces the user-facing answer. Detect at runtime; if the model never emits tool calls, just stream normally.

**Make the model actually use its tools (critical - this is the #1 reason web search "does not work").** Declaring tools is not enough; local models will answer from memory unless the system prompt tells them to use the tools. Always prepend a built-in **agent system prompt** (in addition to, and ahead of, any user-edited system prompt) that does all of the following:

- States the current date and time, and the user's timezone, injected at request time (for example "The current date/time is 2026-05-31T14:03-06:00."). Without this the model guesses or refuses time questions.
- Tells the model it has tools and lists them: web search, fetch URL, and the filesystem actions.
- Instructs it to call `web_search` (then `fetch_url` if needed) **whenever the question involves current, real-time, recent, or external information** - news, prices, weather, "today", "now", current time in another place, anything after its training cutoff, or anything it is unsure about - rather than answering from memory.
- Instructs it to use the filesystem tools when the user asks to read, create, or edit files.
- Frames the assistant as running locally **with internet access through its tools**. Never tell the model it lacks internet or cannot reach the web - that wording suppresses tool use and is wrong for this app.

Keep the user-editable system prompt in Settings separate and additive; the built-in tool-guidance prompt must always be present even if the user clears their own.

Gate side effects: `write_file`, `create_folder`, and `delete_path` outside the agent working directory, and any `delete_path` at all, must not execute until the user approves them in the UI (the loop pauses, emits an approval-request event, and resumes on approval). If the model only does web search and in-directory edits, no prompt is needed.

If the selected model does not support tool calling, detect that and tell the user to switch to a tool-capable model (offer to open the model library); fall back to plain chat in the meantime.

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
- **Sidebar toggle in the header, to the left of the chat title.** On **desktop**, show a panel/sidebar icon (a rounded box with a vertical line near one edge) that **collapses and expands the chat history pane** in place; collapsing it gives the chat panel the full width. The collapse/expand must be **animated, not instant**: transition the pane's width (~200ms ease-out) with its content held at a fixed width and clipped (`overflow-hidden`) so it slides/clips closed and open smoothly rather than snapping or squishing - do **not** toggle it with `display:none`/`hidden`. On a **mobile breakpoint**, replace that icon with the mobile menu (a hamburger ☰) that opens/closes the history as a slide-over drawer (animated via a `transform` translate, with the dimmed backdrop fading in). Only one of the two shows at a given breakpoint, both sit to the left of the title, and each has a clear `aria-label` (and `aria-expanded` for the desktop collapse). Honor `prefers-reduced-motion` (the global reduced-motion rule collapses these transitions to ~0ms).
- Talk to the backend (not Ollama directly) so streaming, persistence, uploads, and file writes all work.
- **Render each message as a "text window," not a chat bubble.** Do not use rounded speech-bubble shapes with a tail corner or left/right alignment per role. Instead, each message is a clean, bordered rectangular panel (a "window") with consistent rounded corners (~8px), a 1px border, and a small role label at the top (for example "You" / "Assistant"). Distinguish the user's windows with a subtle accent treatment (for example a 3px accent-blue left border) rather than a colored bubble. Both roles render full width within a centered, readable max-width column (~`max-w-3xl`) so it reads like a document/transcript of stacked text windows rather than a back-and-forth bubble chat.
- Render assistant messages as markdown with syntax-highlighted code blocks. User messages render as plain wrapped text inside their window.
- Stream tokens into the UI as they arrive.
- **On first open, a fresh chat is already open and ready - the user never has to click "New chat" to begin.** When the app loads (and whenever no chat is selected), automatically present a new, empty chat with the message input focused so the user can start typing immediately. Do **not** auto-select the most recent past chat on startup, and do **not** show a "pick or create a chat" empty state as the landing view - land directly in a ready new chat. Treat this initial chat as an **in-memory draft**: do not write an empty chat row to the database on launch. Persist it (via `POST /api/chats`) only when the user sends the first message, at which point it gets an id and a title and appears in the sidebar. The **"New chat" button** does the same thing on demand (clears to a fresh focused draft); saved chats in the sidebar are left untouched and remain one click away.

**Streaming responses (critical - avoid duplicated words)**

Each streamed line carries a token *delta*; append it to the current assistant message exactly once. The most common bug here is doubled output (for example "II'm'm here here"). It happens when the React state updater mutates the existing message object instead of returning new data. React renders under `<React.StrictMode>`, which **invokes state updater functions twice in development** to surface impure updates; a mutating updater then appends every token twice. Follow these rules so it never happens:

- State updater functions must be **pure**: never mutate existing state. `const copy = [...messages]` is only a shallow copy, so `copy[last]` is the *same* object - mutating `copy[last].content` mutates real state. Build a new object and a new array instead.

```tsx
// Correct: pure update, safe under StrictMode double-invocation
setMessages((prev) => {
  if (prev.length === 0) return prev;
  const last = prev[prev.length - 1];
  if (last.role !== "assistant") return prev;
  const updated = { ...last, content: last.content + delta };
  return [...prev.slice(0, -1), updated];
});
```

```tsx
// Wrong: mutates the existing message object -> tokens doubled in dev
setMessages((prev) => {
  const copy = [...prev];
  copy[copy.length - 1].content += delta; // mutation!
  return copy;
});
```

- Keep `<React.StrictMode>` enabled (do not remove it to hide the symptom). If updaters are pure, StrictMode causes no duplication and the production build behaves identically.
- Send a message only from the explicit send handler, never from an effect. Never run two streams at once - track the in-flight state with a ref (mirroring the React state so the decision doesn't race) plus an `AbortController`. Instead of dropping a send made while a reply is generating, **queue it** (see "Queued messages" below).
- Parse the NDJSON stream by buffering partial lines, splitting on `\n`, and parsing only complete lines once. Do not reprocess the buffer.

**Queued messages**

- The user can keep typing and sending while a reply is still generating. Each such message goes into a **FIFO queue** and is sent **automatically, one at a time, in order** as soon as the model is free. They are never sent concurrently.
- The send box stays usable during a reply: pressing Enter (or the send button, shown as **"Queue"** while streaming) adds the message to the queue and clears the input. The Stop button stays available.
- Show the queued messages near the input as a small list with a count (for example "Queued (2)"), each with its text preview and a control to **remove/cancel** that item before it runs.
- Drive the queue from refs (a synchronous in-flight flag and the queue array), not only React state, so rapid sends don't race. Dequeue the next message in the **completion path** (after the finished reply has been reloaded from the server), so the new turn starts from the correct, persisted history and IDs.
- **Stop cancels everything**: aborting the in-flight reply also clears the queue, so the user is never surprised by queued messages firing after they hit Stop.
- The queue belongs to the active chat's turn; an approval pause holds the queue until the user approves/denies and the current turn finishes.

**Per-message actions (below each text window)**

- Show all three actions - **Copy, Revert, and Fork** - under **every message of both roles**: the user's prompts **and** the assistant's replies. Do **not** gate Revert/Fork to assistant messages only - reverting or forking from a user prompt is a primary use case (re-ask from that point, branch the conversation there). All three icons must appear under user prompts. The icon row sits **aligned to the right-hand side, just below the text window** - quiet by default, more visible on hover/focus. Each has an accessible label and tooltip:
  - **Copy** - copy that message's text to the clipboard (show a brief "Copied" confirmation).
  - **Revert to here** - return the chat to this message by deleting every message after it (calls `POST /api/chats/:id/revert`). Because it is destructive, confirm first; then replace the visible messages with the trimmed history. Works on a user prompt or an assistant reply.
  - **Fork** - create a new chat that includes all history up to and including this message (calls `POST /api/chats/:id/fork`), then switch to the new chat. The original chat is left intact. Works on a user prompt or an assistant reply.
- Actions require a **real saved message id**, so disable them while a reply is still streaming and for not-yet-persisted messages. After a response finishes, reload the chat from `GET /api/chats/:id` so every message carries its database id (and persisted sources) and the actions work reliably.

**Working indicator**

- While the model is working (from the moment the user sends until the first tokens arrive, and while it is thinking or running tools), show a **spinning/animated working indicator** in the chat - for example an animated spinner or typing dots in the assistant message window. It tells the user the app is busy. (Model loading is covered by its own labeled indicator below.)
- Replace the spinner with streamed text once tokens start arriving, and remove it entirely when the response completes or is stopped.
- **Loading the model into RAM:** whenever the model has to load into memory and it takes more than a moment - on switching the LLM toggle on, on starting a new chat, on the first message after it was unloaded or idle, or on app startup - show a **spinning loading indicator with a clear label** such as "Loading model into memory..." until the model is fully loaded and ready. Then proceed to the response (or, when the user flipped the toggle on manually, set the toggle to On and hide the indicator). The toggle itself shows the "Starting…" state while this happens. Disable the send button while loading and re-enable it once ready.

**Agent activity, web sources, and approvals**

- Show tool activity inline as the agent works: compact status chips/steps like "Searching the web", "Reading file", "Wrote `path`", each with the target query/path. Keep them visible but secondary to the final answer.
- When the answer used web search, list the source links (title + URL) under the message so the user can verify, like Claude/Cursor citations.
- When a tool action needs approval (writing/creating outside the working directory, or any delete), pause and show an approval card with the exact action and full path, plus Approve / Deny buttons. For file writes, show the content or a diff before approving. Resuming continues the agent loop.
- Let the user set a default approval mode in Settings: "ask every time" vs "auto-approve inside the working directory" (deletes always ask). Default to auto-approve inside the working directory.

**Settings panel**

**Make Settings reachable from an obvious, labeled place - not only a small gear icon.** Put a clearly labeled **Settings** entry in the **sidebar menu, alongside "Manage LLMs" and "How to"** (the same footer group), so it is discoverable next to the other menus. A gear icon in the header is fine as an additional shortcut, but the labeled sidebar item is required - a lone unlabeled gear is easy to miss and users report "there are no settings". Wire the sidebar item, the header gear, and any keyboard shortcut to the **same** open handler so they all open the one Settings panel. Verify clicking the entry actually renders the panel (it must mount when settings have loaded; guard against rendering before the settings fetch resolves).

Every setting shows a brief one-line description under its label explaining what it does in plain language. Include at least:

- **Appearance (theme)** - a choice of **Light**, **Dark**, or **Follow system settings**, defaulting to **Follow system settings**. Description: "Choose a light or dark look, or follow your computer's system setting automatically." Implement with Tailwind's **`class`** dark-mode strategy (`darkMode: "class"`), toggling a `dark` class on the `<html>` element. For "Follow system settings", read `window.matchMedia("(prefers-color-scheme: dark)")` and add a listener so the look updates live when the OS switches between light and dark. Persist the choice as a config field `theme` (`"light" | "dark" | "system"`, default `"system"`) and also mirror it to `localStorage`, then add a tiny inline script in `index.html` `<head>` that reads `localStorage` and applies the `dark` class **before first paint** so there is no flash of the wrong theme on load.
- **RAM reserved for the LLM** - a slider. Dragging it to the **right reserves more RAM for the LLM** (so it can run bigger, smarter models); dragging it left frees memory for your other apps. The slider value **is the LLM budget**, so it increases as the handle moves right. RAM reserved for other apps = total RAM - LLM budget, and that derived value is the `reservedRamGb` API parameter. Show both numbers live as the user drags, for example "LLM budget: 11 GB / reserved for other apps: 37 GB (of 48 GB total)", seeded from the Phase 1 value. The model library's fit indicators recompute from this slider. Description: "More memory for the LLM lets you run bigger, smarter models; reserve more for your other apps if your computer feels slow."
- **Temperature** - a slider (roughly 0 to 1). Description: "Controls how creative vs. focused the replies are. Lower is more precise and repeatable; higher is more varied and creative."
- **System prompt** - a text area. Description: "Standing instructions the model follows in every message of this app (its personality and rules)."
- **Agent working directory** - current path with a way to change it (folder picker or path field). Description: "The folder the assistant can change files in freely. It can read files anywhere on your computer; writing or deleting outside this folder needs your approval."
- **Web search** - on/off toggle, plus an optional provider API key field (stored locally, git-ignored, never committed). Description: "Lets the assistant look things up on the internet to answer with current information."
- **Approval mode** - choice between "ask every time" and "auto-approve inside the working directory" (deletes always ask). Description: "When the assistant changes files, decide whether it asks you first or acts automatically inside its working folder."
- **Unload LLM when app closes** - on/off toggle. Description: "Free up RAM by unloading the model from memory when you close the app. The model reloads automatically the next time you send a message."
- **Unload LLM after idle** - optional toggle plus idle minutes (for example 5, 15, 30). Description: "Automatically unload the model from memory after you have not chatted for a while, so other apps can use the RAM."

Saving: the Settings panel has a **Save** button. Clicking **Save**, the **X (close) button**, or outside the panel persists the changes and **closes the Settings window** automatically - any edit the user made is saved on close. Provide a separate **Cancel** button that closes **without** saving (the only discard path).

**LLM on/off (free RAM when not chatting)**

- Use **one toggle switch** that is both the status and the action - do not show a separate status pill plus an action button (that duplicates the same information). Poll `GET /api/models/runtime` periodically or refresh on focus to keep the switch state accurate. The switch position and color carry the state, but a **bare colored toggle is not self-explanatory** - so place a **persistent, always-visible text label** beside it that names the control and its state. Show a fixed **"LLM"** label plus the current state word ("On" / "Off" / "Starting…"), for example `LLM  On`. Do **not** hide this label on small screens (no `hidden sm:inline`) - the user must always be able to tell that this control loads/unloads the model. The switch has three visual states:
  - **Off** - switch left, grey/neutral, label "LLM off". Clicking it loads the model back into memory (a load/warm-up that runs a tiny prefetch request against the active model so it reloads without needing a chat message), moving through the loading state to On.
  - **Loading into RAM** - switch mid-travel with a small spinner on the knob, amber, label "Starting…", control disabled. Reuse the same loading visual as the model-into-RAM indicator so the states feel consistent.
  - **On** - switch right, green, label "LLM on". Clicking it calls `POST /api/models/unload` to free RAM; the model stays installed on disk and the switch returns to Off.
- The whole switch is the click target, with `role="switch"` and `aria-checked` for accessibility, and a tooltip describing what a click will do.
- **Starting a new chat turns the LLM back on**: if the model is unloaded when the user clicks "New chat", load it (same warm-up) so it is ready, and set the toggle to On.
- Sending a message also loads the model automatically if it is off (the first reply may have a short delay while it loads).
- Place a small **info button** (for example an "i" icon) immediately beside the on/off control. Clicking it opens a **popup panel** (modal or anchored popover) that explains in plain language: what the toggle does, that "Off" unloads the model from memory to free RAM, that the model stays installed on disk, that it reloads automatically when you send the next message or start a new chat (with a possible short wait), and that this is different from uninstalling a model. Include a short **tip that if the computer feels slow, turn the LLM off to free up memory**, ideally as a visually distinct callout. Suggested copy:
  - **On:** the model is loaded in your computer's memory (RAM) and ready to reply instantly.
  - **Off:** the model is unloaded to give that RAM back to your other apps. Flip it off to unload, on to load it back. While it loads you'll see a spinner and "Starting…".
  - **Tip:** if your computer feels slow, turn the LLM off to free up memory.
  - Turning it off does not uninstall the model. It stays on disk and reloads automatically the next time you send a message or start a new chat, so that first reply may take a few extra seconds.
  - The popup must have a **clear Close control** - a visible **X** button in the corner and/or a labeled **Close** button. Clicking X or Close dismisses the panel. Optionally also close on Escape and click-outside, but the X/Close button is required.
- Optionally offer a separate **Warm up model** action for users who want zero wait before typing.
- Respect the Settings toggles: unload on app close (call unload when the user closes the tab/window or when the dev server stops), and unload after idle when configured.

**How to (help menu)**

- Add a sidebar or header menu item labeled **How to**. Opening it shows a scrollable help panel **titled "How to"** with short, plain-language sections describing the main features and how to use them. Each section has a heading and a clear, concise explanation (a sentence or a few). Write each section heading so it reads as a complete phrase after the panel title "How to" - for example "Chat" works ("How to Chat"), but "Settings" does not, so use "Adjust settings" ("How to Adjust settings"). List **Tip the creator first**, then the rest.
- **Any terminal command shown in the How to panel must appear in an easy copy box**: a monospace command with a **Copy** button (and a brief "Copied" confirmation), not buried in a sentence. Use short numbered steps for multi-step instructions (like starting/stopping the app) so a non-technical reader can follow them.
- Include at least these sections (headings shown as they should appear):
  - **Tip the creator** - note that the app is free and runs entirely on the user's own computer, and that optional tips can be sent to the creator, Matthew Bailie, on Venmo at **@Matthew-Bailie**. Include a clickable button/link to the Venmo profile (`https://venmo.com/u/Matthew-Bailie`) that opens in a new tab (`target="_blank"` with `rel="noopener noreferrer"`). Make clear tips are optional.
  - **Start and stop the app** (list this **second, right after Tip the creator**) - **lead with the one-click launcher**: the easiest way to start is to **double-click `Free AI Forever.command` (macOS) or `Free AI Forever.bat` (Windows)** in the app's folder - no typing. State clearly: (1) double-click that launcher file (on macOS the first time only, right-click → Open to clear Gatekeeper); (2) a small terminal window opens, the launcher **starts the local server for you**, and the app **opens in your web browser** - keep that terminal window open the whole time; (3) to stop, close that terminal window (or press Ctrl+C / Control + C); chats are saved. Then offer the **terminal alternative** for anyone who prefers it, in two **copy boxes**: a `cd path/to/Free-AI-Forever` template (go into the app's folder first - the folder that contains `package.json`) and `npm run dev`, then open the web address the terminal prints in any browser. Include a short **troubleshooting note** (visually distinct callout): if double-clicking does nothing, confirm Node.js is installed (nodejs.org); if using the terminal you see `npm error … Could not read package.json … ENOENT`, the command was run outside the app's folder, so do the `cd` step into the app's folder first, then run `npm run dev` again. **Do not tell the user to install the app to the Dock, taskbar, Start menu, or Launchpad - this app runs in a web browser; there is no installable desktop app.**
  - **Chat** - send messages to your local AI; replies stream in word by word; an animated indicator shows while it thinks and a Stop button cancels a reply; history is saved automatically.
  - **Choose a model** - pick which installed model to use from the dropdown below the chat box; models that exceed the current RAM budget are greyed out and marked "needs more RAM".
  - **Queue follow-up messages** - keep typing while a reply generates; pressing Enter (the button reads "Queue" while busy) lines messages up to send automatically in order; queued messages show above the input with a count and can be removed; Stop clears the queue.
  - **Copy, revert, or fork a message** - hover a message to reveal small icons below it on the right: Copy the text, Revert the chat back to that point (deletes later messages, with confirmation), or Fork a new chat that keeps the history up to that message (original untouched).
  - **Manage chat history** - start new chats; open a chat's menu with the three-dots (⋮) button that appears on hover or by right-clicking it, then pin, rename, fork (copy the whole chat into a new one), or delete; pinned chats stay on top; everything persists across restarts.
  - **Search your chats** - the sidebar search box matches both chat titles and message text and shows a snippet of the match.
  - **Manage LLMs** - browse and download models that fit your computer; see size, RAM, and whether each can reach the internet; filter by Model type; use Refresh to check the internet for new models; only locally runnable models are listed; remove models to free disk space.
  - **Turn the LLM on/off** - flip the toggle off to unload the model from memory and free RAM; flip it on (or just send a message) to load it back; a spinner shows while it loads; if the computer feels slow, turn it off.
  - **Use files and images** - drag and drop or attach files; the model reads text files as context; images work with vision-capable models.
  - **Search the web** - when enabled in Settings, the assistant looks things up online and shows its sources; needs a tool-capable model and an internet connection.
  - **Work with files on your computer** - the assistant can read files anywhere on your hard drive (except protected system folders) and write files directly to it; changes inside its working folder are automatic, while writing or deleting outside that folder asks for your approval; set the working folder and approval mode in Settings.
  - **Switch light or dark mode** - set Appearance in Settings to Light, Dark, or Follow system (the default, which matches the computer's setting).
  - **Adjust settings** - change the RAM budget, temperature, system prompt, working folder, web search, approval mode, appearance theme, and when the model unloads; changes save on Save, on closing with the X, or on clicking outside the panel.
- The How to panel closes with a clear **X** or **Close** button, same pattern as other modals/panels in the app.

**Model library ("Manage LLMs")**

- The menu item is labeled **Manage LLMs** and is **slightly highlighted** to draw attention - for example a subtle accent background or border - without being loud or distracting. It should read as gently emphasized next to the other menu items.
- The list refreshes **live every time the user opens it**: re-fetch `GET /api/models/available` (and the installed list) on open so fit, installed status, and the newest models are always current. Do not show a stale cached list.
- The panel has a **Refresh button** (a refresh/reload icon, clearly visible near the panel title). Clicking it re-queries the catalog with `refresh=true`, which forces a fresh internet check for the most up-to-date models and bypasses the cache. While refreshing, show a spinner on the button and disable it; on completion, update the list and show a brief "Up to date" / "Last checked <time>" indicator. If the refresh failed because the internet was unreachable, show a small non-blocking note (for example "Couldn't reach the model source - showing the last known list") and keep the existing list.
- A **background check for new models** runs without the user clicking anything: when the panel opens (and optionally on an interval while it stays open, for example every few minutes), quietly query the upstream source. If a **new model is found** that is not already in the displayed list, refresh the list to include it and subtly flag the additions (for example a "New" tag on the just-discovered cards) so the user notices what changed. Do this silently in the background - no blocking spinner over the whole panel, and never remove or reorder what the user is looking at beyond inserting the new entries.
- The panel shows each downloadable LLM as a card with: name, description, download size, RAM requirement, vision support, and a clear indicator of whether it fits this machine and whether it is already installed.
- **Clearly call out internet access on every card.** Tool-capable models can search the web and fetch pages; non-tool models cannot. Show an explicit badge such as a green "🌐 Internet" on models that can access the internet and a muted "No internet" badge on those that cannot, and include a short legend near the top of the panel explaining the two (for example: "🌐 Internet = can search the web and fetch pages; No internet models answer only from what they already know"). Do not rely on a vague "tools" label - the user should immediately see which models can go online.
- **Show the RAM budget and where to change it.** In the header, alongside the budget summary ("Your budget: ~X GB RAM (reserving Y GB), Z GB free disk"), include a short note pointing the user to manage the RAM allocation in **Settings → "RAM reserved for the LLM"**, and explain that a larger LLM budget lets you run larger models locally. This connects the greyed-out / "exceeds RAM budget" cards to the control that fixes them.
- **One "Latest" badge per model family.** Highlight the newest model in *each* family with a "Latest" badge that names the family (for example "Latest Qwen", "Latest Llama"), using the per-family `isLatest` flag from the API - not a single global latest. This lets the user spot the newest Qwen, the newest Llama, etc. at a glance. Pin/sort the latest models near the top.
- A **"Model type" dropdown at the top of the panel** filters the list by family (Qwen, Llama, Mistral, and so on, built from the families present in the list), plus an "All types" option that shows everything. Selecting a type shows only that family's models; show a friendly empty state if none match.
- Mark **newly discovered** models (those found via the internet refresh that are not in the bundled catalog) with a subtle "New" badge so the user can see what the refresh added.
- Fit indicators are driven by the RAM reservation slider in Settings (see below): when the user changes how much RAM is reserved, the "fits / does not fit" state on each card recomputes from the new LLM budget.
- Each not-yet-installed model has a Download button that calls `POST /api/models/pull` and shows live download progress (progress bar / percentage). This works for **any** model in the list - bundled catalog models and newly discovered ones alike - downloading and installing it into the app. On completion the model appears in the model dropdown automatically.
- **Handle a failed download visibly.** If the pull reports an error (non-OK response or an `error` line in the stream), stop the progress indicator and show the error message on that model's card, leaving the Download button available to retry. Never silently clear the progress as if it succeeded when the model did not install.
- Installed models can be removed to free disk (`DELETE /api/models/:tag`), with a confirmation step.

**Model dropdown below the chat box**

- Directly below the chat input, show a dropdown listing the locally installed models (from `GET /api/models`). Selecting one sets the active model for the current chat. This dropdown is the **only** place the active model name is shown - do not also display the model name in the top-right corner or header (that duplication is unnecessary). The header keeps just the chat title and the LLM on/off toggle.
- The app is named **Free AI Forever**. Use that name as the browser tab title (`<title>`) and as the header title when no chat is open (it falls back to the active chat's title once a conversation is selected). Do not name the app "Local LLM Chat".
- **Grey out models that do not fit the current LLM budget.** Compare each installed model's estimated RAM requirement against the LLM budget (total RAM - reserved, from the Settings slider). Models that need more RAM than the budget are shown **disabled/greyed** in the dropdown with a clear indicator such as "— needs more RAM" (and optionally the model's RAM requirement). They cannot be selected while the budget is too low.
- **When the RAM budget changes, the selected model adjusts automatically.** If the user lowers the LLM budget (drags the slider left) and the currently selected model no longer fits, switch the active model to the largest installed model that still fits and show a brief notice explaining the switch. If the budget is raised again, previously greyed models become selectable. This keeps the app from trying to run a model the machine can no longer afford.

**Chat input box**

- Auto-expanding textarea: grows with content up to a maximum of 15 lines, then becomes internally scrollable instead of growing further.
- Enter sends the message; Shift+Enter inserts a newline. Disable send while a response is streaming (show the stop-generation control instead).
- Attachments: a button to pick files/images, plus **drag-and-drop** of files and images onto the chat box. Show a visible drop zone / highlighted overlay while a file is dragged over it, and prevent the browser's default behavior of opening the dropped file. Also accept images pasted from the clipboard.
- Show selected attachments as removable chips/thumbnails (with name and size) before sending; images route to the vision model, text files become context, and the user can remove any attachment before sending.
- If the active model is not vision-capable and the user attaches an image, warn them and suggest switching to (or installing) a vision model; text files still work with any model.

**Layout and UI quality**

- Responsive: works from a narrow window up to wide desktop. On desktop, a header sidebar-toggle icon (left of the chat title) collapses/expands the history pane; on narrow widths that icon becomes a hamburger that opens the history as a drawer. The chat panel and input stay usable either way.
- Clean UI guidelines: consistent spacing scale, readable line length for messages, clear visual hierarchy, accessible color contrast, visible focus states, keyboard navigation for the sidebar and menus, and a light/dark theme that respects the OS preference. Follow the full **Design system and UI/UX guidelines** below.

**Design system and UI/UX guidelines (hard requirements)**

Build a modern web application. Treat the following as hard requirements, not suggestions. Implement design tokens (color, spacing, typography, radius) once - in the Tailwind theme and/or CSS variables - and build every component from those tokens so the system stays consistent and themeable across the light and dark themes.

Design philosophy:

- Clean, calm, content-first. The interface should recede so the user's work (their chat) stands out.
- Consistency over novelty. Reuse the same patterns, spacing, and components everywhere.
- Accessible by default. Every choice must work for keyboard, screen reader, and low-vision users.
- Purposeful, restrained motion. Animate to clarify state changes, never to decorate.

Color:

- Use a neutral gray scale for backgrounds, surfaces, borders, and text. Build the UI mostly from grays.
- Use ONE accent color (a blue around `#2680EB` / `hsl(214, 82%, 53%)`) for primary actions, focus states, selection, and active navigation only. Do not spread the accent across the UI.
- Reserve semantic colors strictly: green for success/positive, red/orange for errors and destructive actions, yellow/amber for warnings, blue for informational. Never use red or green for purely decorative purposes.
- Support a light and a dark theme from the same token set, wired to the **Appearance (theme)** setting above. Define colors as semantic tokens (for example `background-base`, `background-layer-1`, `text-primary`, `text-secondary`, `border-default`, `accent`), not raw hex values scattered in components.
- Text contrast must meet WCAG AA: at least 4.5:1 for body text, 3:1 for large text and UI controls, in both themes.

Typography:

- One clean sans-serif system font stack (for example `-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`).
- Use a clear type scale with limited sizes: 12, 14 (body default), 16, 18, 22, 28, 36 px. Do not invent arbitrary sizes.
- Body line-height ~1.5; headings ~1.2. Limit line length to ~60-75 characters for readability (this is why message text uses a max width like `prose`).
- Weight conveys hierarchy: regular for body, medium/semibold for emphasis and headings. Avoid more than 2-3 weights.
- Left-align text by default. Never justify. Avoid all-caps except for small overline labels.

Spacing and layout:

- Use an 8px spacing grid (4px allowed for fine adjustments). All margins, padding, and gaps are multiples of 4/8.
- Be generous with whitespace. Group related elements tightly and separate unrelated groups clearly.
- Use a max content width (~1280px) with responsive breakpoints. Layout must reflow gracefully from mobile to desktop.
- Align elements to a consistent grid. Maintain consistent padding inside cards, panels, and dialogs (for example 16-24px).

Corners, elevation, borders:

- Subtle rounded corners: ~4-8px on buttons, inputs, cards; larger (~12-16px) only on big surfaces like modals.
- Use elevation sparingly. Prefer flat surfaces separated by 1px borders or a single subtle shadow. Avoid heavy drop shadows and gradients.
- Borders are thin (1px) and low-contrast.

Components:

- Buttons: clear hierarchy. Primary (filled accent) for the main action, secondary (outline/neutral) for alternatives, quiet/text for low-emphasis. One primary button per view. Destructive actions use a distinct red treatment and require confirmation.
- Form fields: visible labels above inputs (never rely on placeholder as the label). Show helper text, required indicators, and inline validation messages with clear error styling. Adequate touch target size (min 32-44px height).
- Provide explicit states for every interactive element: default, hover, focus (visible focus ring in the accent color), active, disabled, selected, error, loading.
- Use clear empty states, loading skeletons, and error states. Never show a blank screen.
- Feedback: use toasts/inline messages for results; use modals only for focused decisions or critical confirmations. Don't trap the user.
- Icons: a single consistent line-icon set, sized on the grid (16/20/24px), always paired with a label or accessible name.
- Navigation: predictable and persistent. Highlight the current location (for example the selected chat) with the accent color.

Accessibility (required):

- Full keyboard operability: logical tab order, visible focus indicators, no keyboard traps, support Escape to dismiss overlays.
- Correct semantics: real buttons/links, proper heading hierarchy, labeled form controls, ARIA only where native semantics fall short.
- Respect `prefers-reduced-motion` and `prefers-color-scheme`.
- Don't convey meaning by color alone; pair color with text or icons.
- Manage focus when opening/closing dialogs and on view changes.

Motion:

- Fast, subtle transitions (~100-250ms, ease-out). Animate opacity, position, and size to clarify state. No bouncing, spinning (except genuine loading indicators), or attention-grabbing effects. Honor `prefers-reduced-motion` by reducing or removing animation.
- **Every menu, popover, dialog, and modal animates on both open and close**, not just open. Implement this with a small set of reusable CSS keyframes (defined once in the global stylesheet) plus a tiny shared hook so the behavior is consistent everywhere:
   - Define keyframes `fadeIn`/`fadeOut` for backdrops, `panelIn`/`panelOut` for centered dialogs/modals (fade plus a ~6px upward translate and a 0.98→1 scale), and `menuIn` for small popovers/context menus (fade plus a ~4px translate and 0.97→1 scale from the top). Durations: ~150ms backdrop, ~170ms panel in / ~140ms panel out, ~120ms menus. All `ease-out`. The exit keyframes use `forwards` so the element holds its final (invisible) frame until it unmounts.
   - Closing must actually be animated, which means the element cannot unmount instantly. Provide a `useDismissAnimation(duration)` hook that returns `{ closing, dismiss, reset }`: calling `dismiss(action)` flips `closing` to `true` (swapping the panel to its "out" animation) and then runs `action` after `duration` ms. If `action` resolves to `false` or throws, the close is cancelled and `closing` resets so the panel stays open with its error - important for "save on close" dialogs whose save can fail. `reset()` returns to the open state and is used by popovers that re-open without unmounting (e.g. an info popup inside a long-lived control).
   - Wire **all** dismiss paths through the hook: the X button, the Close/Cancel button, the click-outside backdrop handler, and the Escape key (`useOnEscape`) all call the animated `close`/`dismiss`, never the raw `onClose`. This applies to the Model library / Manage LLMs window, Settings, the How to panel, and the LLM on/off info popup.
   - Context menus (the chat history ⋮ menu) get the `menuIn` enter animation with a top transform-origin; closing a context menu instantly on outside-click/Escape is acceptable and expected, so an exit animation there is optional.
   - The mobile chat-history drawer slides in/out via a `transition-transform` translate (~150ms ease) and its dimmed backdrop fades in. Because the global `prefers-reduced-motion` rule collapses all of these to ~0ms, reduced-motion users get instant, non-animated open/close for free.

Deliverable expectations:

- Implement design tokens (color, spacing, typography, radius) as variables and build all components from them so the system stays consistent and themeable.
- The result should feel professional, quiet, and trustworthy, like a polished enterprise productivity tool.

---

## Phase 5 - Required feature spec (acceptance criteria)

The app must satisfy all of the following. Treat this as your checklist before declaring done.

**Chat**

- On first open, the app lands directly in a fresh, ready chat with the input focused - the user can type and send without clicking "New chat" first. No "pick or create a chat" landing screen, and no auto-opening the most recent past chat. The empty chat is an in-memory draft and is only written to the database when the first message is sent.
- Send a prompt and get a streamed response from the local model.
- Streamed text appears exactly once - no duplicated/repeated words (verify with the dev server, where React StrictMode would expose impure state updates).
- A spinning/animated working indicator shows while the model is thinking or running tools, and disappears when the reply finishes or is stopped.
- When the model has to load into RAM (turn on, new chat, first message after unload/idle, or startup), a spinning loading indicator labeled something like "Loading model into memory..." shows until it is ready, with send disabled until then.
- Stop-generation button that cancels an in-flight response.
- Messages sent while a reply is generating are **queued** and sent automatically in order once the model is free; the queue shows a count and lets the user cancel an item, and Stop clears the queue. No two replies stream at once.
- Small action icons under **every message text window, for both the user's prompts and the assistant's replies**: **Copy** the message, **Revert** the chat to that message (deletes later messages, with confirmation), and **Fork** a new chat that keeps the history up to that message. All three appear on user prompts too (not assistant-only). Disabled while streaming and for unsaved messages.
- Messages render as **text windows** (bordered rectangular panels with a role label), not rounded speech bubbles, stacked in a centered readable column.
- Markdown rendering with code syntax highlighting.

**History**

- Multiple chats persisted across restarts (SQLite).
- Sidebar lists chats; pinned chats sorted to the top, then most-recently updated.
- "New chat" button.
- Search chats by **title and message content**: the search field matches the chat title and the text inside each chat, and returns the list of matching chats (with a snippet of the matching message when the match is in the body). Searching runs against the backend `GET /api/chats/search` endpoint (debounced); an empty query shows the full list.
- Auto-generate a chat title from the first user message.

**Chat history item menu (three-dots + right-click)**

- Each chat row shows a **three vertical dots (⋮) button on the right of the title** that appears on hover (and on keyboard focus). Clicking it opens the chat menu anchored just below the dots. **Right-clicking the row opens the same menu** at the cursor. Keep the row's title from overlapping the dots (reserve space on the right) and truncate long titles.
- The menu contains, in this order:
  - **Pin / Unpin.**
  - **Rename** (inline edit).
  - **Fork** - create a new chat containing this chat's full history (calls `POST /api/chats/:id/fork` with no `messageId`) and switch to it; the original is unchanged.
  - **Delete** (with a confirmation step).
- The menu closes on outside click, scroll, or Escape, and is keyboard accessible (`role="menu"` / `menuitem`, visible focus rings).

**Files and images**

- Upload one or more files/images in a message, via a file picker, drag-and-drop onto the chat box, or paste from the clipboard.
- A clear drop zone/overlay appears while dragging, and the browser does not open the dropped file.
- Selected attachments appear as removable chips/thumbnails before sending.
- Images are sent to the vision model and influence the response.
- Text files are included as context.

**Web search (internet)**

- The model can search the web when a question needs current or external information, and use the results in its answer.
- The model can fetch and read a specific URL the user provides.
- Answers that used the web show their source links.
- Web requests are SSRF-protected (no access to localhost/private/metadata addresses).

**Filesystem (read/write, Cursor/Claude-like)**

- The app reads and writes files directly on the computer's hard drive, like Cursor or Claude.
- The model can list and read files **anywhere on disk** (except protected system folders) without per-action prompts.
- Inside the agent working directory the model can also write files and create folders without prompts. The user can change the working directory in Settings.
- Writing/creating **outside** the working directory, and any delete, requires an in-UI approval showing the exact full path (and a content preview/diff for writes).
- Protected OS/system directories are never writable, and `..` traversal and symlink escapes are rejected.

**Model library (Manage LLMs)**

- The "Manage LLMs" menu item is subtly highlighted to draw attention.
- Opening the panel re-fetches the list live every time (no stale cache); it lists downloadable models with description, download size, and RAM/system requirements.
- A Refresh button forces a fresh internet check for the most up-to-date open-source models and merges any newly found models into the list (flagged "New"). A background check also runs on open. If the internet is unreachable, the last known list is kept and a brief note is shown.
- There is **one "Latest" badge per model family** (for example "Latest Qwen" and "Latest Llama"), marking the newest model in each family rather than a single global latest.
- A "Model type" dropdown at the top of the panel filters the list by family (Qwen, Llama, etc.), with an "All types" option.
- The bundled default catalog already covers the popular families (Qwen, Llama, Mistral, DeepSeek, Gemma, GLM, Granite, Nemotron, LFM, plus vision models) so the list and type filter are populated before any refresh.
- If no models are listed, the panel shows a note telling the user to click **Refresh** to check the internet for available models.
- Both bundled and newly discovered models can be downloaded and installed from this panel. Every model shown is actually pullable - cloud-only library entries (no local size) are filtered out and never appear as downloadable.
- A failed download surfaces a clear error on the model card and keeps the Download button available to retry; it never silently resets as if it had succeeded.
- Each card clearly shows whether the model can access the internet (a green "🌐 Internet" badge) or not ("No internet"), with a short legend explaining the difference.
- Each model shows whether it fits this machine and whether it is already installed; fit recomputes when the RAM reservation slider changes.
- Download button pulls the model with live progress; on completion it is connected to the app and selectable.
- Installed models can be removed (with confirmation) to free disk.

**Model selection**

- A dropdown directly below the chat box lists locally installed models; selecting one sets the active model for the chat.
- Models that need more RAM than the current LLM budget are greyed out with a "needs more RAM" indicator. If the budget is lowered below the active model's requirement, the app automatically switches to the largest model that still fits.

**LLM runtime (RAM management)**

- A single toggle switch that is both status and action: Off (grey, RAM freed), Starting… (amber, spinner while loading into RAM), and On (green, model loaded). No separate status pill - the switch carries the state. A **persistent, always-visible text label** beside the switch names the control and its state (a fixed "LLM" label plus "On" / "Off" / "Starting…"), not hidden on small screens, so the user can tell what the toggle does at a glance.
- Flipping it on reloads the model into memory; flipping it off unloads it to free RAM without uninstalling it.
- Starting a new chat turns the LLM back on if it was off; sending a message also reloads it automatically.
- An info button beside the on/off control opens a popup explaining what it does; the popup closes with a clear X or Close button.
- Unload frees RAM immediately; the model reloads on demand (with a short delay).
- Optional Settings: unload when the app closes, and unload after idle minutes.

**How to (help)**

- A **How to** menu item opens a help panel describing main features: chat, download LLMs, turn LLM on/off, model picker, files/images, web search, filesystem tools, chat history, Settings, how to start/stop the app, and a "Tip the creator" section linking to Venmo @Matthew-Bailie.
- The panel closes with a clear X or Close button.

**Chat input**

- Input textarea auto-expands up to 15 lines, then scrolls internally.
- Enter sends; Shift+Enter adds a newline.

**Layout and UI**

- Responsive from narrow window to wide desktop; sidebar collapses behind a toggle on small widths.
- Clean UI: consistent spacing, clear hierarchy, accessible contrast, visible focus states, light/dark theme following the OS preference.
- Meets the **Design system and UI/UX guidelines** (Phase 4): neutral gray surfaces with a single blue accent (~`#2680EB`) used only for primary actions/focus/selection, semantic colors reserved for success/error/warning/info, an 8px spacing grid, a limited type scale on a system sans-serif stack, subtle 1px borders over heavy shadows, design tokens shared across both themes, and explicit hover/focus/active/disabled/selected/error/loading states. WCAG AA contrast in both themes, full keyboard operability with visible accent focus rings, Escape closes overlays, meaning is never conveyed by color alone, and motion is fast/subtle (~100-250ms ease-out) and honors `prefers-reduced-motion`.

**Settings**

- Settings is reachable from a clearly labeled **Settings** item in the sidebar menu (next to "Manage LLMs" and "How to"); a header gear may also open it, but the labeled sidebar item must exist. Clicking it renders the Settings panel.
- Every setting has a brief plain-language description of what it does.
- Clicking Save, the X, or outside the panel persists changes and closes the Settings window; a separate Cancel button closes without saving.
- An **Appearance** setting with **Light**, **Dark**, and **Follow system settings** options, defaulting to **Follow system settings**. The app uses Tailwind's `class` dark-mode strategy, follows live OS changes when set to system, and applies the saved theme before first paint (via an inline script in `index.html` reading `localStorage`) so there is no flash of the wrong theme.
- A "RAM reserved for the LLM" slider where dragging right gives the LLM more memory (the value is the LLM budget). It shows the live LLM budget vs RAM reserved for other apps (reserved for other apps = total RAM - LLM budget) and drives the model library's fit indicators.
- Editable system prompt and temperature (temperature as a slider).
- Agent working directory path.
- Web search on/off and optional provider API key.
- Approval mode (ask every time vs auto-approve inside the working directory).
- Unload LLM when app closes, and optional unload after idle.

**Network behavior**

- The model runs locally on the user's hardware, and the app has internet access through its tools (web search and URL fetch). The model is local; its reach is not.
- Outbound calls happen for: web search and URL fetching, and downloading a new model from the "Manage LLMs" library. These are expected, user-triggered calls, not telemetry.
- The app sends no analytics or data to third parties; the only outbound traffic is the web-search/fetch the user triggers and model downloads.

---

## Phase 6 - Print run instructions

Set up the root `package.json` so a single `npm install` installs both frontend and backend (use npm workspaces, or a root `install` script / `postinstall` that installs each), and so a single `npm run dev` starts both (use `concurrently`). This works the same on macOS and Windows. The user must never have to install or start the two parts separately.

The root `package.json` must define **all** of these scripts (the launcher and single-port mode depend on them):

- `dev` - run backend + frontend dev servers together via `concurrently` (the everyday development command; frontend on its Vite port with the `/api` proxy).
- `build` - build **both** parts for production: compile the backend TypeScript to `backend/dist` **and** build the frontend to `frontend/dist` (for example `npm --prefix backend run build && npm --prefix frontend run build`).
- `start` - run the **built** single-port server in production: `node backend/dist/index.js` (which serves the API and the built frontend on one port). The backend needs its own `build` (tsc) and `start` (node dist) scripts for this.
- `launch` - `node launch.mjs`, the terminal-friendly equivalent of double-clicking the launcher.

`launch.mjs` relies on `build` producing `backend/dist/index.js` and `frontend/dist/index.html`, and on the single-port server starting from the built backend, so these scripts must exist and work on both macOS and Windows.

### Single-port production mode (required - powers the one-click launcher)

In addition to the two-server dev mode, the backend must be able to serve the **built** frontend itself so the whole app runs on **one URL/port** with no separate dev server:

- The frontend already calls the API with **relative paths** (`/api/...`), so it works same-origin with no extra config. Keep it that way.
- After registering the `/api/*` routes, have the Express server serve the static built frontend (`frontend/dist`) **when that build exists**, with an SPA fallback that returns `index.html` for any non-`/api` GET so client routing works. Requests under `/api/` must never hit the fallback (they should 404 normally if unmatched). Guard the static serving behind an existence check so `npm run dev` (which uses the Vite dev server + proxy) is unaffected.
- On startup, log the single app URL (for example `Open http://127.0.0.1:<port>/`). The server keeps binding to `127.0.0.1` only.

### One-click desktop launcher (open it like a normal app)

Ship a double-click launcher so non-technical users never need the terminal:

- **`launch.mjs`** (project root, plain Node, no extra dependencies): on run it (1) installs dependencies if any `node_modules` are missing, (2) builds the app if `backend/dist` or `frontend/dist` is missing, (3) starts the single-port server as a child process, (4) polls `GET /api/health` until it answers, then (5) **opens the app in the user's web browser** at `http://127.0.0.1:<port>/`. You may open it in a clean browser window (for example Chrome/Edge with `--app=<url>` so there are no tabs cluttering the view); if no Chromium-family browser is found, open the default browser at the URL. This is still just a browser tab/window - **do not describe it as an installed desktop app**. Handle SIGINT/SIGTERM by stopping the child server.
- **`Free AI Forever.command`** (macOS) and **`Free AI Forever.bat`** (Windows): tiny double-click wrappers that `cd` to their own folder, check Node is installed (point to https://nodejs.org if not), and run `node launch.mjs`. Mark the `.command` executable (`chmod +x`). The terminal window they open is also the app's "on" state - closing it (or Ctrl+C) stops the app. Note in the README that the first macOS launch may need right-click → Open to clear Gatekeeper.
- Add a root `package.json` script **`"launch": "node launch.mjs"`** as the terminal-friendly equivalent.

### The app runs in a web browser (no desktop install)

This app is served over `http://127.0.0.1:<port>/` and **runs in the user's web browser**. There is intentionally **no installable desktop app, no Dock/taskbar/Start-menu install, and no "Install Free AI Forever" prompt**. Do not add PWA install instructions or tell the user to pin the app to the Dock or taskbar - the only way to run it is to start the launcher (or `npm run dev`) and open the printed web address in a browser. A favicon/app icon (`frontend/public/icon.svg`) is fine for the browser tab, but do not market an installable app.

Write these exact run instructions into the project `README.md` AND print them in the chat at the end. Assume the user is not technical: spell out how to open a terminal, exactly what to copy and paste, and how to open the app in a browser. Use the real folder path you created and the real port the app uses (replace `5173` if different). Do not abbreviate the steps.

**macOS - print this:**

```
HOW TO RUN FREE AI FOREVER (macOS)

EASIEST WAY (no typing) - just double-click
  1. Open the Free-AI-Forever folder in Finder.
  2. Double-click "Free AI Forever.command".
     The first time, macOS may block it: right-click the file, choose Open, then
     click Open again. You only need to do that once.
  3. A small Terminal window opens and the app opens in your web browser. The first
     launch takes a minute while it sets itself up; after that it is quick.
  4. To stop the app, close that Terminal window (or click it and press Control + C).

If the double-click ever does not work, use the manual steps below.

Do step A only the very first time. After that, just do step B every time.

STEP A - one-time setup (skip if you already did this)
  1. Open the Terminal app: press Command (cmd) + Spacebar, type "Terminal", press Return.
  2. Copy the line below, paste it into Terminal (Command + V), then press Return:
       cd "/full/path/to/Free-AI-Forever"
  3. Copy this line, paste it, press Return, and wait until it finishes:
       npm install

STEP B - start the app (do this every time)
  1. Make sure Ollama is running. It normally starts on its own after install. If you
     are not sure, open the Ollama app from your Applications folder once (you will see
     a small llama icon in the menu bar at the top of the screen).
  2. Open the Terminal app (Command + Spacebar, type "Terminal", press Return).
  3. Copy this line, paste it, press Return:
       cd "/full/path/to/Free-AI-Forever"
  4. Copy this line, paste it, press Return:
       npm run dev
  5. Wait until you see a line that says the app is running on a web address.
  6. Open your web browser (Safari or Chrome), click the address bar at the top,
     type this and press Return:
       http://localhost:5173
  7. Start chatting.

TO STOP THE APP (turn it off)
  Go back to the Terminal window and press Control + C (hold Control, press C).
  This shuts the app down. You can then close the Terminal window.
  Tip: just closing the Terminal window also stops the app.

FREE UP RAM (optional, while the app is open)
  In the app, flip the LLM toggle to off to unload the model from memory.
  Your other apps get the memory back. The model is still installed; it reloads
  when you send your next message.

TO USE IT AGAIN LATER
  Do STEP B again. You never need to repeat STEP A.

IF YOU SEE THIS ERROR
  "npm error ... Could not read package.json ... ENOENT: no such file or directory"
  It means you ran "npm run dev" in the wrong place (usually your home folder).
  Fix it by doing the "cd" line in STEP B step 3 first - that moves Terminal into
  the app's folder (the Free-AI-Forever folder that has package.json) - then run
  "npm run dev" again.

KEEP THE TERMINAL WINDOW OPEN while you are using the app. If you close it, the app stops.
```

**Windows - print this:**

```
HOW TO RUN FREE AI FOREVER (Windows)

EASIEST WAY (no typing) - just double-click
  1. Open the Free-AI-Forever folder in File Explorer.
  2. Double-click "Free AI Forever.bat".
     If Windows shows a "Windows protected your PC" box, click "More info" then
     "Run anyway". You only need to do that once.
  3. A small window opens and the app opens in your web browser. The first launch
     takes a minute while it sets itself up; after that it is quick.
  4. To stop the app, close that window (or click it and press Ctrl + C).

If the double-click ever does not work, use the manual steps below.

Do step A only the very first time. After that, just do step B every time.

STEP A - one-time setup (skip if you already did this)
  1. Open PowerShell: press the Windows key, type "PowerShell", click "Windows PowerShell".
  2. Copy the line below, paste it into PowerShell (right-click to paste), then press Enter:
       cd "C:\full\path\to\Free-AI-Forever"
  3. Copy this line, paste it, press Enter, and wait until it finishes:
       npm install

STEP B - start the app (do this every time)
  1. Make sure Ollama is running. It normally starts on its own after install. If you
     are not sure, open the Ollama app from the Start menu once (you will see a small
     llama icon near the clock in the taskbar).
  2. Open PowerShell (Windows key, type "PowerShell", click "Windows PowerShell").
  3. Copy this line, paste it (right-click), press Enter:
       cd "C:\full\path\to\Free-AI-Forever"
  4. Copy this line, paste it, press Enter:
       npm run dev
  5. Wait until you see a line that says the app is running on a web address.
  6. Open your web browser (Edge or Chrome), click the address bar at the top,
     type this and press Enter:
       http://localhost:5173
  7. Start chatting.

TO STOP THE APP (turn it off)
  Go back to the PowerShell window and press Ctrl + C (hold Ctrl, press C).
  This shuts the app down. You can then close the PowerShell window.
  Tip: just closing the PowerShell window also stops the app.

FREE UP RAM (optional, while the app is open)
  In the app, flip the LLM toggle to off to unload the model from memory.
  Your other apps get the memory back. The model is still installed; it reloads
  when you send your next message.

TO USE IT AGAIN LATER
  Do STEP B again. You never need to repeat STEP A.

IF YOU SEE THIS ERROR
  "npm error ... Could not read package.json ... ENOENT: no such file or directory"
  It means you ran "npm run dev" in the wrong place (usually your home folder).
  Fix it by doing the "cd" line in STEP B step 3 first - that moves PowerShell into
  the app's folder (the Free-AI-Forever folder that has package.json) - then run
  "npm run dev" again.

KEEP THE POWERSHELL WINDOW OPEN while you are using the app. If you close it, the app stops.
```

After printing the instructions, offer to start the app now and open the browser to `http://localhost:5173` for the user, so their first run is one click.

Troubleshooting (include this in the README and the chat):

- `npm error ... Could not read package.json ... ENOENT: no such file or directory`: `npm run dev` was run outside the app's folder (a terminal usually opens in your home folder). Run the `cd` step into the `Free-AI-Forever` folder (the one containing `package.json`) first, then run `npm run dev` again. Tip for non-technical users: type `cd ` and drag the project folder onto the terminal to fill in the path.
- The browser says "can't connect" or the page is blank: the app is not running. Do STEP B again and make sure the terminal window stays open.
- "Cannot reach the model": confirm Ollama is running with `curl http://localhost:11434/api/tags`. If nothing comes back, open the Ollama app (or run `ollama serve`).
- "Model not found": run `ollama pull <model>`.
- The AI won't search the web / says it can't access the internet / gives a stale or made-up answer to a "current" question (for example "what time is it in NYC"):
   - Check the active model is **tool-capable**. Vision-only models like `llama3.2-vision` cannot call tools, so web search and file actions are off. Switch to a tool-capable model such as `qwen2.5` from the model picker. The app should warn you when the active model lacks tool calling.
   - Make sure web search is turned **on** in Settings.
   - Confirm the built-in agent system prompt is present and tells the model to use `web_search` for current info (see "Make the model actually use its tools"). If you edited the system prompt to say the assistant has no internet or should not use the internet, the model will refuse to search - remove that wording.
   - Test the search path directly: the backend `web_search`/`fetch_url` should return results for a normal query. If the keyless provider is rate-limited or blocked on your network, add a search-provider API key in Settings as a fallback.
- "Port in use" or the address is different: use whatever web address the terminal printed (the port may not be 5173).

Replace the model name, folder path, and port with the real values you used.

---

## Constraints

The app is local-first but intentionally has two real powers: it can reach the internet (web search/fetch) and it can read/write the filesystem. Build both with these safeguards.

**Server and secrets**

- The web/API server binds to `127.0.0.1` so the UI is not exposed on the network. Outbound calls (web search, URL fetch, model downloads) are allowed.
- No hardcoded secrets. If a keyed search provider is used, read its key from an environment variable or local config that is git-ignored. Do not log keys.
- Validate all inputs on the backend: upload size/type limits, JSON shape checks on chat and tool requests.
- Fail securely: on error, return a safe message; never leak stack traces, absolute system paths, or secrets to the client.

**Web access (SSRF protection)** - applies to `fetch_url` and the search provider:

- Allow `http`/`https` only. Reject other schemes (`file:`, `ftp:`, `gopher:`, etc.).
- Resolve the target host and block requests to loopback (`127.0.0.0/8`, `::1`), private ranges (`10/8`, `172.16/12`, `192.168/16`), link-local (`169.254/16`, including the cloud metadata IP `169.254.169.254`), and `*.local`/internal hostnames, unless the user explicitly opts in.
- Do not blindly follow redirects to blocked hosts; re-check the host on each redirect.
- Cap response size and set a request timeout. Strip scripts and return readable text, not executable content.

**Filesystem access (direct hard-drive read/write, with guardrails)**:

- The app works with files directly on the computer's hard drive. Resolve every requested path to its real absolute path (following symlinks) using Node's `path` utilities so it is correct on macOS and Windows.
- Define an **agent working directory** (default `workspace/`, user-configurable). This is the auto-approve zone for changes, not a read sandbox.
- Reading and listing: allowed **anywhere on disk** except protected OS/system directories, without prompting.
- Writing and folder creation: allowed without prompting **inside** the working directory; **outside** it, must be explicitly approved by the user in the UI before they run.
- Deletes always require confirmation, even inside the working directory.
- Reject `..` traversal in relative paths and symlink escapes, and never read from or write to protected OS/system directories (e.g. `/System`, `/usr`, `/etc`, `/var`, Windows `System32`, `Program Files`).
- Show the full path of every write/create/delete in the UI.

**Process**

- Honor the two pause points (RAM reservation, pre-download confirmation). Otherwise proceed autonomously and report progress per phase.

