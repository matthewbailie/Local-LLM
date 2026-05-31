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

If a step fails, stop, show the error, and propose a fix before continuing. The model itself stays local; web search and filesystem actions are real side effects, so build them with the safeguards described in the Constraints section (confined working directory, confirmation for anything destructive or out of scope, SSRF protection on web requests).

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

Decision table (Ollama model tags):


| Model budget | Recommended model                                     | Notes                                  |
| ------------ | ----------------------------------------------------- | -------------------------------------- |
| < 4 GB       | `qwen2.5:1.5b`                                        | Text only. Tight; close other apps.    |
| 4-6 GB       | `qwen2.5:3b`                                          | Text only. Image upload not supported. |
| 6-10 GB      | `qwen2.5-vl:7b` (fallback `llama3.2-vision:11b`)      | Vision + text.                         |
| 10-24 GB     | `qwen2.5-vl:7b` plus larger text option `qwen2.5:14b` | Vision + strong text.                  |
| 24-48 GB     | `llama3.2-vision:11b` or `qwen2.5-vl:32b`             | High quality vision + text.            |
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

Create the project in a new folder `local-llm-chat/` in the user's current working directory, with this layout:

```
local-llm-chat/
  frontend/    # Vite + React + TypeScript + Tailwind
  backend/     # Node + Express + TypeScript, better-sqlite3
  workspace/   # default agent working directory (read/write); user can point this elsewhere
  package.json # root scripts to run everything together
  README.md
```

The **agent working directory** is the root the model is allowed to read and write within. It defaults to `workspace/` but the user can change it in Settings (for example to a real project folder). The model can act freely inside this directory; anything outside it requires explicit user confirmation (see Constraints).

### Backend (Node + Express + TypeScript)

Use `better-sqlite3` for storage and `multer` (or equivalent) for uploads. Store the chosen model name in a small config so the app knows which model to call. Endpoints:

- `POST /api/chat` - accepts `{ chatId, model, userMessage }` where `userMessage` carries the text plus any image (base64) and text-file attachments. Rebuild the conversation from stored history, then run the **agentic tool-calling loop** (see "Agent tools" below) against Ollama's `http://localhost:11434/api/chat`, streaming the final answer tokens plus tool-activity events back to the client. Persist the user message and the final assistant message.
- `GET /api/chats` - list chats (id, title, pinned, updated_at), pinned first then most-recent.
- `POST /api/chats` - create a new chat.
- `GET /api/chats/:id` - fetch a chat with its messages.
- `PATCH /api/chats/:id` - rename and/or set pinned.
- `DELETE /api/chats/:id` - delete a chat and its messages.
- `POST /api/upload` - accept files and images. For images, convert to base64 and pass them in the `images` field of the Ollama chat message (vision models). For text files, read and include the content as context. Reject unexpected/oversized files.
- `GET /api/models` - list locally installed Ollama models so the UI can offer a model selector.

**Agent tool endpoints** (these are the side-effecting capabilities; each enforces the safeguards in Constraints):

- `POST /api/tools/web-search` - `{ query }` -> a list of results (title, url, snippet). Use a keyless provider by default (for example the DuckDuckGo HTML/Lite endpoint or a self-hosted SearXNG). Optionally support a pluggable provider (Brave Search, Tavily, Serper) whose API key comes from an environment variable, never hardcoded.
- `POST /api/tools/fetch-url` - `{ url }` -> readable text/markdown extracted from the page (strip scripts/markup). Apply SSRF protection (see Constraints): https/http only, block private/loopback/link-local/metadata addresses, cap response size and time.
- `POST /api/tools/fs/list` - `{ path }` -> directory entries within the agent working directory.
- `POST /api/tools/fs/read` - `{ path }` -> file contents within the agent working directory.
- `POST /api/tools/fs/write` - `{ path, content }` -> write/overwrite a file. Allowed without prompting inside the agent working directory; outside it, require an explicit `approved: true` flag set by a user confirmation in the UI. Return the absolute path written.
- `POST /api/tools/fs/mkdir` - `{ path }` -> create a folder (same confinement and approval rules as write).
- `POST /api/tools/fs/delete` - `{ path }` -> delete a file/folder. Always requires user confirmation, even inside the working directory.

All `fs/*` endpoints resolve the real path (following symlinks), reject `..` traversal and OS/system directories, and use Node's `path` utilities so they behave correctly on macOS and Windows.

The model-management endpoints follow:

- `GET /api/models/available?reservedRamGb=<n>` - return a curated catalog of LLMs the user can download, each with: model tag, short description, download size, approximate RAM requirement, whether it is vision-capable, whether it supports tool calling, an `installed` flag, an `isLatest` flag marking the newest recommended model, and a `fits` flag. Compute `fits` against the **LLM budget = total RAM - reservedRamGb** (the value comes from the Settings slider; fall back to the Phase 1 value if omitted) and the free disk from Phase 0. The handler reads current installed models each call so the response is live.
- `POST /api/models/pull` - run `ollama pull <model>` for a model from the catalog and stream download progress back to the client (parse Ollama's pull progress JSON). On completion the model becomes available in `GET /api/models`.
- `DELETE /api/models/:tag` - remove a locally installed model (`ollama rm <tag>`) to free disk.

**Model runtime (load / unload RAM)** - Ollama keeps a model in memory after use, which can consume several GB even when you are not chatting. Let the user free that RAM without uninstalling the model:

- `GET /api/models/runtime` - return whether a model is currently loaded in memory (`loaded: true/false`, which model tag, approximate size if available). Use Ollama's `ollama ps` or `GET /api/ps`.
- `POST /api/models/unload` - unload the active model (or all loaded models) from RAM via `ollama stop <model>`. Ollama stays running; only the in-memory weights are released. Return the freed state.
- The first message after unload reloads the model automatically (expect a short delay on the next reply). No separate "load" endpoint is required unless you add an optional "Warm up model" button that sends a tiny prefetch request.

### Agent tools (web search + filesystem) - how the loop works

The chat endpoint is agentic. On each turn:

1. Send the conversation to Ollama's `/api/chat` with a `tools` array declaring the available tools (Ollama tool-calling / JSON schema format). Declare at least: `web_search`, `fetch_url`, `list_directory`, `read_file`, `write_file`, `create_folder`, `delete_path`.
2. If the model responds with `message.tool_calls`, execute each call by routing it to the matching `/api/tools/...` handler. Stream a tool-activity event to the client for each (for example: "Searching the web for ...", "Reading workspace/notes.md", "Wrote app/index.html").
3. Append each tool result to the conversation as a `role: "tool"` message and call the model again.
4. Repeat until the model returns a normal assistant message with no tool calls, or until a safety cap (for example 8 tool rounds) is reached. Then stream the final answer tokens.
5. For web search, encourage the model (via the system prompt) to cite the source URLs it used so the UI can show them.

Note on streaming vs tool calls: some Ollama versions/models return tool calls reliably only in non-streamed responses. A robust approach is to run the tool-decision turns **without** streaming (read the full response, check for `tool_calls`), and switch to `stream: true` only for the final turn that produces the user-facing answer. Detect at runtime; if the model never emits tool calls, just stream normally.

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
- Talk to the backend (not Ollama directly) so streaming, persistence, uploads, and file writes all work.
- Render assistant messages as markdown with syntax-highlighted code blocks.
- Stream tokens into the UI as they arrive.

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
- Send a message only from the explicit send handler, never from an effect, and ignore a new send while one is already streaming (track an in-flight flag / `AbortController`). This prevents two concurrent streams writing to the same message.
- Parse the NDJSON stream by buffering partial lines, splitting on `\n`, and parsing only complete lines once. Do not reprocess the buffer.

**Agent activity, web sources, and approvals**

- Show tool activity inline as the agent works: compact status chips/steps like "Searching the web", "Reading file", "Wrote `path`", each with the target query/path. Keep them visible but secondary to the final answer.
- When the answer used web search, list the source links (title + URL) under the message so the user can verify, like Claude/Cursor citations.
- When a tool action needs approval (writing/creating outside the working directory, or any delete), pause and show an approval card with the exact action and full path, plus Approve / Deny buttons. For file writes, show the content or a diff before approving. Resuming continues the agent loop.
- Let the user set a default approval mode in Settings: "ask every time" vs "auto-approve inside the working directory" (deletes always ask). Default to auto-approve inside the working directory.

**Settings panel**

Every setting shows a brief one-line description under its label explaining what it does in plain language. Include at least:

- **RAM reserved for the LLM** - a slider. It sets how much of the machine's memory is available to the model versus held back for other apps. Show both numbers live as the user drags (for example "LLM budget: 10 GB / reserved for other apps: 6 GB"), seeded from the Phase 1 value. The model library's fit indicators recompute from this slider. Description: "More memory for the LLM lets you run bigger, smarter models; reserve more for your other apps if your computer feels slow."
- **Temperature** - a slider (roughly 0 to 1). Description: "Controls how creative vs. focused the replies are. Lower is more precise and repeatable; higher is more varied and creative."
- **System prompt** - a text area. Description: "Standing instructions the model follows in every message of this app (its personality and rules)."
- **Agent working directory** - current path with a way to change it (folder picker or path field). Description: "The folder the assistant can freely read and write. Anything outside it needs your approval."
- **Web search** - on/off toggle, plus an optional provider API key field (stored locally, git-ignored, never committed). Description: "Lets the assistant look things up on the internet to answer with current information."
- **Approval mode** - choice between "ask every time" and "auto-approve inside the working directory" (deletes always ask). Description: "When the assistant changes files, decide whether it asks you first or acts automatically inside its working folder."
- **Unload LLM when app closes** - on/off toggle. Description: "Free up RAM by unloading the model from memory when you close the app. The model reloads automatically the next time you send a message."
- **Unload LLM after idle** - optional toggle plus idle minutes (for example 5, 15, 30). Description: "Automatically unload the model from memory after you have not chatted for a while, so other apps can use the RAM."

**LLM on/off (free RAM when not chatting)**

- Show a clear **LLM status** in the header or near the model dropdown: **Running** (model loaded in RAM) vs **Off** (unloaded, RAM freed). Poll `GET /api/models/runtime` periodically or refresh on focus.
- Provide a toggle or button: **Turn LLM off** / **Free RAM** calls `POST /api/models/unload`. When off, disable send (or show a note that the model will load on the next message) and explain that RAM is freed but the model is still installed on disk.
- Place a small **info button** (for example an "i" icon) immediately beside the on/off control. Clicking it opens a **popup panel** (modal or anchored popover) that explains in plain language: what the toggle does, that "Off" unloads the model from memory to free RAM, that the model stays installed on disk, that it reloads automatically when you send the next message (with a possible short wait), and that this is different from uninstalling a model. The popup must have a **clear Close control** - a visible **X** button in the corner and/or a labeled **Close** button. Clicking X or Close dismisses the panel. Optionally also close on Escape and click-outside, but the X/Close button is required.
- Turning "on" happens automatically when the user sends the next message (the model reloads). Optionally offer **Warm up model** to load it into RAM before chatting if the user wants zero wait on the first reply.
- Respect the Settings toggles: unload on app close (call unload when the user closes the tab/window or when the dev server stops), and unload after idle when configured.

**Instructions (help menu)**

- Add a sidebar or header menu item labeled **Instructions** (or **How it works**). Opening it shows a scrollable help panel with short, plain-language sections describing the main features and how to use them. Each section has a heading and 2-4 sentences. Include at least:
  - **Chat** - send messages to your local AI; replies stream in; history is saved automatically.
  - **Check for new LLMs** - browse and download models that fit your computer; see RAM requirements; remove models to free disk space.
  - **Turn LLM on/off** - unload the model from memory to free RAM when you are not chatting; it reloads on your next message.
  - **Choose a model** - pick which installed model to use from the dropdown below the chat box.
  - **Files and images** - drag and drop or attach files; the model can read them; images work with vision-capable models.
  - **Web search** - the assistant can look things up online when enabled in Settings.
  - **Working with files on your computer** - the assistant can read and write files in its working folder; changes outside that folder ask for your approval.
  - **Chat history** - start new chats; pin, rename, or delete chats from the sidebar (right-click).
  - **Settings** - adjust RAM budget, temperature, system prompt, working folder, and web search.
  - **Starting and stopping the app** - brief reminder: run `npm run dev` to start, Control/Ctrl+C in the terminal to stop, keep the terminal open while using the app.
- The Instructions panel closes with a clear **X** or **Close** button, same pattern as other modals/panels in the app.

**Model library ("Check for new LLMs")**

- The "Check for new LLMs" menu item is **slightly highlighted** to draw attention - for example a subtle accent background or border - without being loud or distracting. It should read as gently emphasized next to the other menu items.
- The list refreshes **live every time the user opens it**: re-fetch `GET /api/models/available` (and the installed list) on open so fit, installed status, and the newest models are always current. Do not show a stale cached list.
- The panel shows each downloadable LLM as a card with: name, description, download size, RAM requirement, vision support, tool-calling support, and a clear indicator of whether it fits this machine and whether it is already installed.
- The **latest / newest recommended model is highlighted** (a "Latest" badge and visual emphasis) so the user can spot it immediately. Sort or pin it near the top.
- Fit indicators are driven by the RAM reservation slider in Settings (see below): when the user changes how much RAM is reserved, the "fits / does not fit" state on each card recomputes from the new LLM budget.
- Each not-yet-installed model has a Download button that calls `POST /api/models/pull` and shows live download progress (progress bar / percentage). On completion the model appears in the model dropdown automatically.
- Installed models can be removed to free disk (`DELETE /api/models/:tag`), with a confirmation step.

**Model dropdown below the chat box**

- Directly below the chat input, show a dropdown listing the locally installed models (from `GET /api/models`). Selecting one sets the active model for the current chat. Show the active model name at all times.

**Chat input box**

- Auto-expanding textarea: grows with content up to a maximum of 15 lines, then becomes internally scrollable instead of growing further.
- Enter sends the message; Shift+Enter inserts a newline. Disable send while a response is streaming (show the stop-generation control instead).
- Attachments: a button to pick files/images, plus **drag-and-drop** of files and images onto the chat box. Show a visible drop zone / highlighted overlay while a file is dragged over it, and prevent the browser's default behavior of opening the dropped file. Also accept images pasted from the clipboard.
- Show selected attachments as removable chips/thumbnails (with name and size) before sending; images route to the vision model, text files become context, and the user can remove any attachment before sending.
- If the active model is not vision-capable and the user attaches an image, warn them and suggest switching to (or installing) a vision model; text files still work with any model.

**Layout and UI quality**

- Responsive: works from a narrow window up to wide desktop. On narrow widths the history sidebar collapses behind a toggle; the chat panel and input stay usable.
- Clean UI guidelines: consistent spacing scale, readable line length for messages, clear visual hierarchy, accessible color contrast, visible focus states, keyboard navigation for the sidebar and menus, and a light/dark theme that respects the OS preference.

---

## Phase 5 - Required feature spec (acceptance criteria)

The app must satisfy all of the following. Treat this as your checklist before declaring done.

**Chat**

- Send a prompt and get a streamed response from the local model.
- Streamed text appears exactly once - no duplicated/repeated words (verify with the dev server, where React StrictMode would expose impure state updates).
- Stop-generation button that cancels an in-flight response.
- Copy button on each message.
- Markdown rendering with code syntax highlighting.

**History**

- Multiple chats persisted across restarts (SQLite).
- Sidebar lists chats; pinned chats sorted to the top, then most-recently updated.
- "New chat" button.
- Search/filter chats by title.
- Auto-generate a chat title from the first user message.

**Right-click context menu on a history item**

- Pin / Unpin.
- Rename (inline edit).
- Delete (with a confirmation step).

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

- The model can list, read, and write files and create folders within the agent working directory without per-action prompts.
- The user can change the agent working directory in Settings.
- Writing/creating outside the working directory, and any delete, requires an in-UI approval showing the exact path (and a content preview/diff for writes).
- All filesystem actions are path-confined: no `..` traversal, no symlink escapes, no system/OS directories.

**Model library (check for new LLMs)**

- The "Check for new LLMs" menu item is subtly highlighted to draw attention.
- Opening the panel re-fetches the list live every time (no stale cache); it lists downloadable models with description, download size, and RAM/system requirements.
- The newest recommended model is highlighted with a "Latest" badge.
- Each model shows whether it fits this machine and whether it is already installed; fit recomputes when the RAM reservation slider changes.
- Download button pulls the model with live progress; on completion it is connected to the app and selectable.
- Installed models can be removed (with confirmation) to free disk.

**Model selection**

- A dropdown directly below the chat box lists locally installed models; selecting one sets the active model for the chat.

**LLM runtime (RAM management)**

- A visible Running / Off (RAM freed) status and a control to unload the model from memory without uninstalling it.
- An info button beside the on/off control opens a popup explaining what it does; the popup closes with a clear X or Close button.
- Unload frees RAM immediately; the model reloads on the next message (with a short first-reply delay).
- Optional Settings: unload when the app closes, and unload after idle minutes.

**Instructions (help)**

- An **Instructions** (or **How it works**) menu item opens a help panel describing main features: chat, download LLMs, turn LLM on/off, model picker, files/images, web search, filesystem tools, chat history, Settings, and how to start/stop the app.
- The panel closes with a clear X or Close button.

**Chat input**

- Input textarea auto-expands up to 15 lines, then scrolls internally.
- Enter sends; Shift+Enter adds a newline.

**Layout and UI**

- Responsive from narrow window to wide desktop; sidebar collapses behind a toggle on small widths.
- Clean UI: consistent spacing, clear hierarchy, accessible contrast, visible focus states, light/dark theme following the OS preference.

**Settings**

- Every setting has a brief plain-language description of what it does.
- RAM-reserved-for-the-LLM slider that shows the live LLM budget vs reserved amount and drives the model library's fit indicators.
- Editable system prompt and temperature (temperature as a slider).
- Agent working directory path.
- Web search on/off and optional provider API key.
- Approval mode (ask every time vs auto-approve inside the working directory).
- Unload LLM when app closes, and optional unload after idle.

**Network and offline behavior**

- The model itself runs locally, so plain chat works offline.
- Features that need the internet: web search and URL fetching, and downloading a new model from the "Check for new LLMs" library. These are expected outbound calls, not telemetry.
- The app sends no analytics or data to third parties; the only outbound traffic is the web-search/fetch the user triggers and model downloads.

---

## Phase 6 - Print run instructions

Set up the root `package.json` so a single `npm install` installs both frontend and backend (use npm workspaces, or a root `install` script / `postinstall` that installs each), and so a single `npm run dev` starts both (use `concurrently`). This works the same on macOS and Windows. The user must never have to install or start the two parts separately.

Write these exact run instructions into the project `README.md` AND print them in the chat at the end. Assume the user is not technical: spell out how to open a terminal, exactly what to copy and paste, and how to open the app in a browser. Use the real folder path you created and the real port the app uses (replace `5173` if different). Do not abbreviate the steps.

**macOS - print this:**

```
HOW TO RUN YOUR LOCAL LLM CHAT APP (macOS)

Do step A only the very first time. After that, just do step B every time.

STEP A - one-time setup (skip if you already did this)
  1. Open the Terminal app: press Command (cmd) + Spacebar, type "Terminal", press Return.
  2. Copy the line below, paste it into Terminal (Command + V), then press Return:
       cd "/full/path/to/local-llm-chat"
  3. Copy this line, paste it, press Return, and wait until it finishes:
       npm install

STEP B - start the app (do this every time)
  1. Make sure Ollama is running. It normally starts on its own after install. If you
     are not sure, open the Ollama app from your Applications folder once (you will see
     a small llama icon in the menu bar at the top of the screen).
  2. Open the Terminal app (Command + Spacebar, type "Terminal", press Return).
  3. Copy this line, paste it, press Return:
       cd "/full/path/to/local-llm-chat"
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
  In the app, use "Turn LLM off" or "Free RAM" to unload the model from memory.
  Your other apps get the memory back. The model is still installed; it reloads
  when you send your next message.

TO USE IT AGAIN LATER
  Do STEP B again. You never need to repeat STEP A.

KEEP THE TERMINAL WINDOW OPEN while you are using the app. If you close it, the app stops.
```

**Windows - print this:**

```
HOW TO RUN YOUR LOCAL LLM CHAT APP (Windows)

Do step A only the very first time. After that, just do step B every time.

STEP A - one-time setup (skip if you already did this)
  1. Open PowerShell: press the Windows key, type "PowerShell", click "Windows PowerShell".
  2. Copy the line below, paste it into PowerShell (right-click to paste), then press Enter:
       cd "C:\full\path\to\local-llm-chat"
  3. Copy this line, paste it, press Enter, and wait until it finishes:
       npm install

STEP B - start the app (do this every time)
  1. Make sure Ollama is running. It normally starts on its own after install. If you
     are not sure, open the Ollama app from the Start menu once (you will see a small
     llama icon near the clock in the taskbar).
  2. Open PowerShell (Windows key, type "PowerShell", click "Windows PowerShell").
  3. Copy this line, paste it (right-click), press Enter:
       cd "C:\full\path\to\local-llm-chat"
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
  In the app, use "Turn LLM off" or "Free RAM" to unload the model from memory.
  Your other apps get the memory back. The model is still installed; it reloads
  when you send your next message.

TO USE IT AGAIN LATER
  Do STEP B again. You never need to repeat STEP A.

KEEP THE POWERSHELL WINDOW OPEN while you are using the app. If you close it, the app stops.
```

After printing the instructions, offer to start the app now and open the browser to `http://localhost:5173` for the user, so their first run is one click.

Troubleshooting (include this in the README and the chat):

- The browser says "can't connect" or the page is blank: the app is not running. Do STEP B again and make sure the terminal window stays open.
- "Cannot reach the model": confirm Ollama is running with `curl http://localhost:11434/api/tags`. If nothing comes back, open the Ollama app (or run `ollama serve`).
- "Model not found": run `ollama pull <model>`.
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

**Filesystem access (confinement + least privilege)**:

- Define an **agent working directory** (default `workspace/`, user-configurable). Resolve every requested path to its real absolute path (following symlinks) using Node's `path` utilities so it is correct on macOS and Windows.
- Inside the working directory: list/read/write/create are allowed without prompting.
- Outside the working directory: writes, folder creation, and deletes must be explicitly approved by the user in the UI before they run.
- Deletes always require confirmation, even inside the working directory.
- Always reject `..` traversal and symlink escapes that resolve outside the approved root, and never write to OS/system directories.
- Show the full path of every write/create/delete in the UI.

**Process**

- Honor the two pause points (RAM reservation, pre-download confirmation). Otherwise proceed autonomously and report progress per phase.

