import { Router } from "express";
import type { Response } from "express";
import { randomUUID } from "node:crypto";
import db from "../db.js";
import { loadConfig } from "../config.js";
import { chatOnce, streamChat, type ChatMessage, type ToolCall, type ToolDef } from "../ollama.js";
import { tagSupportsTools } from "../catalog.js";
import { classifyPath, deletePath, FsError, listDirectory, makeDir, needsApproval, readFile, writeFile } from "../tools/fs.js";
import { fetchUrl, webSearch, WebError } from "../tools/web.js";

const router = Router();

const MAX_CONTENT = 200_000;
const MAX_IMAGES = 6;
const MAX_IMAGE_B64 = 20 * 1024 * 1024;
const MAX_TOOL_ROUNDS = 8;

interface Source {
  title: string;
  url: string;
}

interface AgentState {
  chatId: string;
  model: string;
  temperature: number;
  approvalMode: string;
  webSearchEnabled: boolean;
  toolsEnabled: boolean;
  messages: ChatMessage[];
  rounds: number;
  sources: Source[];
  turnCalls: ToolCall[];
  callIndex: number;
  decision: "approve" | "deny" | null;
  finalText: string;
  aborted: boolean;
  controller: AbortController;
}

// In-memory store of loops paused awaiting user approval (single local user).
const pending = new Map<string, { state: AgentState; expires: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of pending) if (v.expires < now) pending.delete(k);
}, 60_000).unref();

const TOOL_DEFS: ToolDef[] = [
  { type: "function", function: { name: "web_search", description: "Search the web for current information. Returns titles, URLs and snippets.", parameters: { type: "object", properties: { query: { type: "string", description: "The search query" } }, required: ["query"] } } },
  { type: "function", function: { name: "fetch_url", description: "Fetch a web page and return its readable text.", parameters: { type: "object", properties: { url: { type: "string", description: "The full http(s) URL" } }, required: ["url"] } } },
  { type: "function", function: { name: "list_directory", description: "List files and folders in any directory on the computer. Accepts a relative path (resolved against the working directory) or an absolute path anywhere on disk except protected system folders.", parameters: { type: "object", properties: { path: { type: "string", description: "Relative path (default '.') or an absolute path like /Users/me/Documents" } }, required: ["path"] } } },
  { type: "function", function: { name: "read_file", description: "Read a text file anywhere on the computer (relative to the working directory, or an absolute path), except protected system folders.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "write_file", description: "Create or overwrite a text file anywhere on the computer (relative or absolute path). Inside the working directory it is automatic; elsewhere it asks the user to approve first.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "create_folder", description: "Create a folder.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "delete_path", description: "Delete a file or folder. Always asks the user first.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
];

// Built-in agent system prompt. Without this, local models answer current/real-time
// questions from memory instead of calling web_search. Includes the current date/time
// so the model can answer time-sensitive questions and decide when it is out of date.
function buildAgentSystemPrompt(webEnabled: boolean): string {
  const now = new Date();
  const iso = now.toISOString();
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "local";
  const local = now.toLocaleString();
  const lines = [`The current date and time is ${local} (${iso}). The user's timezone is ${tz}.`];
  if (webEnabled) {
    lines.push(
      "You run locally on the user's computer and you have internet access through your tools. Use them to look things up.",
      "You have these tools: web_search (search the web), fetch_url (read a web page), and filesystem actions (list_directory, read_file, write_file, create_folder, delete_path).",
      "Call web_search (and then fetch_url if you need page details) WHENEVER the question involves current, real-time, recent, or external information: news, prices, weather, sports, schedules, the current time or date in a place, anything described as 'today'/'now'/'latest', anything after your training cutoff, or anything you are unsure about. Do not answer such questions from memory.",
      "When you use web search, cite the source URLs you relied on.",
    );
  } else {
    lines.push("You run locally on the user's computer. You have filesystem tools: list_directory, read_file, write_file, create_folder, delete_path.");
  }
  lines.push(
    "Use the filesystem tools when the user asks to read, create, or edit files or folders. You can read files anywhere on the computer and write inside the working directory; writing or deleting outside it asks the user first.",
  );
  return lines.join("\n");
}

function toolsFor(state: AgentState): ToolDef[] {
  return TOOL_DEFS.filter((t) => {
    const name = t.function.name;
    if ((name === "web_search" || name === "fetch_url") && !state.webSearchEnabled) return false;
    return true;
  });
}

function getArg(call: ToolCall, key: string): string {
  const args = call.function.arguments;
  const obj = typeof args === "string" ? safeJson(args) : args;
  const v = obj?.[key];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function writeEvent(res: Response, obj: unknown) {
  if (!res.writableEnded) res.write(JSON.stringify(obj) + "\n");
}

// Stream one model turn. Streams answer tokens to the client and returns the
// accumulated content plus any tool calls the model requested.
async function streamTurn(res: Response, state: AgentState, tools: ToolDef[] | undefined): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const upstream = await streamChat({ model: state.model, messages: state.messages, temperature: state.temperature, tools, signal: state.controller.signal });
  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  const toolCalls: ToolCall[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let json: { message?: { content?: string; tool_calls?: ToolCall[] }; error?: string };
      try {
        json = JSON.parse(line);
      } catch {
        continue;
      }
      if (json.error) throw new Error(json.error);
      const delta = json.message?.content ?? "";
      if (delta) {
        content += delta;
        writeEvent(res, { type: "token", content: delta });
      }
      if (json.message?.tool_calls?.length) toolCalls.push(...json.message.tool_calls);
    }
  }
  return { content, toolCalls };
}

// Emit already-generated text to the client as token events so the UI renders it
// progressively. Tool-decision turns run non-streamed (reliable tool detection),
// so the final answer is streamed this way.
async function pseudoStream(res: Response, content: string) {
  if (!content) return;
  const chunkSize = 18;
  const addDelay = content.length <= 6000;
  for (let i = 0; i < content.length; i += chunkSize) {
    if (res.writableEnded) return;
    writeEvent(res, { type: "token", content: content.slice(i, i + chunkSize) });
    if (addDelay) await new Promise((r) => setTimeout(r, 6));
  }
}

async function executeTool(res: Response, call: ToolCall, state: AgentState): Promise<string> {
  const name = call.function.name;
  try {
    switch (name) {
      case "web_search": {
        const q = getArg(call, "query");
        writeEvent(res, { type: "tool_activity", tool: name, label: `Searching the web for "${q}"` });
        const results = await webSearch(q);
        for (const r of results) if (r.url) state.sources.push({ title: r.title || r.url, url: r.url });
        if (state.sources.length) writeEvent(res, { type: "sources", sources: dedupeSources(state.sources) });
        return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n\n") || "No results found.";
      }
      case "fetch_url": {
        const url = getArg(call, "url");
        writeEvent(res, { type: "tool_activity", tool: name, label: `Reading ${url}` });
        const { url: finalUrl, text } = await fetchUrl(url);
        state.sources.push({ title: finalUrl, url: finalUrl });
        writeEvent(res, { type: "sources", sources: dedupeSources(state.sources) });
        return text || "(no readable text)";
      }
      case "list_directory": {
        const p = getArg(call, "path") || ".";
        writeEvent(res, { type: "tool_activity", tool: name, label: `Listing ${p}` });
        return listDirectory(p);
      }
      case "read_file": {
        const p = getArg(call, "path");
        writeEvent(res, { type: "tool_activity", tool: name, label: `Reading file ${p}` });
        return readFile(p);
      }
      case "write_file": {
        const p = getArg(call, "path");
        const abs = writeFile(p, getArg(call, "content"));
        writeEvent(res, { type: "tool_activity", tool: name, label: `Wrote ${abs}` });
        return `Wrote file: ${abs}`;
      }
      case "create_folder": {
        const abs = makeDir(getArg(call, "path"));
        writeEvent(res, { type: "tool_activity", tool: name, label: `Created folder ${abs}` });
        return `Created folder: ${abs}`;
      }
      case "delete_path": {
        const abs = deletePath(getArg(call, "path"));
        writeEvent(res, { type: "tool_activity", tool: name, label: `Deleted ${abs}` });
        return `Deleted: ${abs}`;
      }
      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    const msg = err instanceof FsError || err instanceof WebError ? err.message : "Tool execution failed.";
    return `Error: ${msg}`;
  }
}

function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of sources) {
    if (!seen.has(s.url)) {
      seen.add(s.url);
      out.push(s);
    }
  }
  return out;
}

// Returns true if the loop suspended awaiting approval (response ended).
function approvalInfo(call: ToolCall, state: AgentState): { needed: boolean; action?: Record<string, unknown> } {
  const name = call.function.name;
  const map: Record<string, "write" | "mkdir" | "delete"> = { write_file: "write", create_folder: "mkdir", delete_path: "delete" };
  const action = map[name];
  if (!action) return { needed: false };
  let insideWorkdir = false;
  let absPath = getArg(call, "path");
  try {
    const info = classifyPath(absPath);
    insideWorkdir = info.insideWorkdir;
    absPath = info.abs;
  } catch {
    return { needed: false }; // invalid path -> executeTool will report the error
  }
  if (!needsApproval(action, insideWorkdir, state.approvalMode)) return { needed: false };
  const detail: Record<string, unknown> = { tool: name, action, path: absPath };
  if (name === "write_file") detail.content = getArg(call, "content").slice(0, 4000);
  return { needed: true, action: detail };
}

async function processCalls(res: Response, state: AgentState): Promise<boolean> {
  while (state.callIndex < state.turnCalls.length) {
    const call = state.turnCalls[state.callIndex];
    const { needed, action } = approvalInfo(call, state);

    if (needed && state.decision === null) {
      const id = randomUUID();
      pending.set(id, { state, expires: Date.now() + 10 * 60_000 });
      writeEvent(res, { type: "approval_request", id, action });
      writeEvent(res, { type: "awaiting_approval", id });
      res.end();
      return true;
    }

    let result: string;
    if (needed && state.decision === "deny") {
      result = "The user denied this action.";
      writeEvent(res, { type: "tool_activity", tool: call.function.name, label: `Denied: ${getArg(call, "path")}` });
    } else {
      result = await executeTool(res, call, state);
    }
    state.decision = null;
    state.messages.push({ role: "tool", content: result, tool_name: call.function.name });
    state.callIndex++;
  }
  state.turnCalls = [];
  state.callIndex = 0;
  return false;
}

function finalize(res: Response, state: AgentState, finalText: string) {
  const text = finalText.trim() || state.finalText.trim();
  if (text) {
    const id = randomUUID();
    db.prepare(`INSERT INTO messages (id, chat_id, role, content, attachments, created_at) VALUES (?, ?, 'assistant', ?, ?, ?)`).run(
      id,
      state.chatId,
      text,
      state.sources.length ? JSON.stringify({ sources: dedupeSources(state.sources) }) : null,
      Date.now()
    );
    writeEvent(res, { type: "done", messageId: id, sources: dedupeSources(state.sources) });
  } else {
    writeEvent(res, { type: "done", sources: dedupeSources(state.sources) });
  }
  db.prepare(`UPDATE chats SET updated_at = ? WHERE id = ?`).run(Date.now(), state.chatId);
  if (!res.writableEnded) res.end();
}

async function runLoop(res: Response, state: AgentState) {
  res.on("close", () => {
    if (!res.writableEnded) {
      state.aborted = true;
      state.controller.abort();
    }
  });
  try {
    // Plain-chat fallback for models without tool calling.
    if (!state.toolsEnabled) {
      const { content } = await streamTurn(res, state, undefined);
      finalize(res, state, content);
      return;
    }

    while (true) {
      if (state.turnCalls.length > state.callIndex) {
        const suspended = await processCalls(res, state);
        if (suspended) return;
      }
      if (state.rounds >= MAX_TOOL_ROUNDS) {
        finalize(res, state, "I reached the tool-use limit for this message.");
        return;
      }
      state.rounds++;
      // Tool-decision turn runs non-streamed for reliable tool_calls detection.
      const { content, toolCalls } = await chatOnce({ model: state.model, messages: state.messages, temperature: state.temperature, tools: toolsFor(state), signal: state.controller.signal });
      if (!toolCalls.length) {
        await pseudoStream(res, content);
        finalize(res, state, content);
        return;
      }
      state.finalText = content;
      state.messages.push({ role: "assistant", content, tool_calls: toolCalls });
      state.turnCalls = toolCalls;
      state.callIndex = 0;
    }
  } catch (err) {
    if (!state.aborted) {
      const msg = err instanceof Error && /does not support tools|tools/.test(err.message) ? "This model does not support tools. Switch to a tool-capable model (e.g. qwen2.5) for web and file actions." : "The model request failed. Is Ollama running?";
      writeEvent(res, { type: "error", error: msg });
    }
    if (!res.writableEnded) res.end();
  }
}

// POST /api/chat
router.post("/", async (req, res) => {
  const cfg = loadConfig();
  const { chatId, model, userMessage } = req.body ?? {};
  if (typeof chatId !== "string") return res.status(400).json({ error: "chatId required" });
  const chat = db.prepare(`SELECT id FROM chats WHERE id = ?`).get(chatId);
  if (!chat) return res.status(404).json({ error: "Chat not found" });
  if (!userMessage || typeof userMessage.content !== "string") return res.status(400).json({ error: "userMessage.content required" });

  const content: string = userMessage.content;
  if (content.length > MAX_CONTENT) return res.status(400).json({ error: "Message too long" });
  const images: string[] = Array.isArray(userMessage.images) ? userMessage.images : [];
  if (images.length > MAX_IMAGES) return res.status(400).json({ error: "Too many images" });
  for (const img of images) if (typeof img !== "string" || img.length > MAX_IMAGE_B64) return res.status(400).json({ error: "Invalid or oversized image" });
  const textFiles: { name: string; content: string }[] = Array.isArray(userMessage.textFiles) ? userMessage.textFiles.slice(0, 10) : [];
  const attachments = Array.isArray(userMessage.attachments) ? userMessage.attachments : [];

  const useModel = typeof model === "string" && model.trim() ? model.trim() : cfg.defaultModel;

  let modelContent = content;
  for (const f of textFiles) {
    if (typeof f?.name === "string" && typeof f?.content === "string") {
      modelContent += `\n\n[Attached file: ${f.name}]\n\`\`\`\n${f.content.slice(0, 100_000)}\n\`\`\``;
    }
  }

  const now = Date.now();
  db.prepare(`INSERT INTO messages (id, chat_id, role, content, attachments, created_at) VALUES (?, ?, 'user', ?, ?, ?)`).run(randomUUID(), chatId, content, JSON.stringify(attachments), now);
  const msgCount = db.prepare(`SELECT COUNT(*) AS c FROM messages WHERE chat_id = ?`).get(chatId) as { c: number };
  if (msgCount.c === 1) {
    const title = content.replace(/\s+/g, " ").trim().slice(0, 60) || "New chat";
    db.prepare(`UPDATE chats SET title = ? WHERE id = ?`).run(title, chatId);
  }

  const history = db.prepare(`SELECT role, content FROM messages WHERE chat_id = ? ORDER BY created_at ASC`).all(chatId) as { role: string; content: string }[];
  const messages: ChatMessage[] = [];
  const toolsEnabled = tagSupportsTools(useModel);
  if (toolsEnabled) {
    messages.push({ role: "system", content: buildAgentSystemPrompt(cfg.webSearchEnabled) });
  }
  if (cfg.systemPrompt.trim()) messages.push({ role: "system", content: cfg.systemPrompt });
  for (const h of history) if (h.role === "user" || h.role === "assistant") messages.push({ role: h.role, content: h.content });
  const last = messages[messages.length - 1];
  if (last && last.role === "user") {
    last.content = modelContent;
    if (images.length) last.images = images;
  }

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");

  const state: AgentState = {
    chatId,
    model: useModel,
    temperature: cfg.temperature,
    approvalMode: cfg.approvalMode,
    webSearchEnabled: cfg.webSearchEnabled,
    toolsEnabled,
    messages,
    rounds: 0,
    sources: [],
    turnCalls: [],
    callIndex: 0,
    decision: null,
    finalText: "",
    aborted: false,
    controller: new AbortController(),
  };

  if (!state.toolsEnabled) writeEvent(res, { type: "notice", message: "This model has no tool calling, so web search and file actions are off. Switch to a tool-capable model (e.g. qwen2.5) to enable them." });

  await runLoop(res, state);
});

// POST /api/chat/continue - resume a loop paused for approval
router.post("/continue", async (req, res) => {
  const { id, approved } = req.body ?? {};
  const entry = typeof id === "string" ? pending.get(id) : undefined;
  if (!entry) return res.status(404).json({ error: "No pending action (it may have expired)." });
  pending.delete(id);

  const state = entry.state;
  state.decision = approved === true ? "approve" : "deny";
  state.controller = new AbortController();
  state.aborted = false;

  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  await runLoop(res, state);
});

export default router;
