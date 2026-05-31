import { OLLAMA_URL } from "./config.js";

export interface OllamaTag {
  name: string;
  model: string;
  size: number;
  digest: string;
  details?: { family?: string; parameter_size?: string; quantization_level?: string };
}

export async function listLocalModels(): Promise<OllamaTag[]> {
  const res = await fetch(`${OLLAMA_URL}/api/tags`);
  if (!res.ok) throw new Error(`Ollama not reachable (status ${res.status})`);
  const data = (await res.json()) as { models?: OllamaTag[] };
  return data.models ?? [];
}

export interface ToolCall {
  function: { name: string; arguments: Record<string, unknown> | string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_calls?: ToolCall[];
  tool_name?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolDef = Record<string, any>;

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  tools?: ToolDef[];
  signal?: AbortSignal;
}

// Non-streamed chat turn. More reliable for detecting tool calls across models,
// so the agent loop uses this for tool-decision turns.
export async function chatOnce(opts: ChatOptions): Promise<{ content: string; toolCalls: ToolCall[] }> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: false,
    options: { temperature: opts.temperature ?? 0.7 },
  };
  if (opts.tools && opts.tools.length) body.tools = opts.tools;
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama chat failed (status ${res.status}): ${text}`);
  }
  const json = (await res.json()) as { message?: { content?: string; tool_calls?: ToolCall[] }; error?: string };
  if (json.error) throw new Error(json.error);
  return { content: json.message?.content ?? "", toolCalls: json.message?.tool_calls ?? [] };
}

export interface RunningModel {
  name: string;
  size?: number;
  size_vram?: number;
  expires_at?: string;
}

// Models currently loaded in memory (Ollama keeps them resident after use).
export async function listRunningModels(): Promise<RunningModel[]> {
  const res = await fetch(`${OLLAMA_URL}/api/ps`);
  if (!res.ok) throw new Error(`Ollama not reachable (status ${res.status})`);
  const data = (await res.json()) as { models?: RunningModel[] };
  return data.models ?? [];
}

// Warm up a model: load it into memory without sending a chat message. An empty
// prompt with keep_alive makes Ollama load the weights and return immediately.
export async function loadModelIntoMemory(tag: string): Promise<void> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: tag, prompt: "", keep_alive: "5m" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama load failed (status ${res.status}): ${text}`);
  }
  await res.text().catch(() => "");
}

// Unload a model from memory without uninstalling it (keep_alive: 0 releases the
// in-memory weights; Ollama itself keeps running).
export async function unloadModelFromMemory(tag: string): Promise<void> {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: tag, prompt: "", keep_alive: 0 }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama unload failed (status ${res.status}): ${text}`);
  }
  await res.text().catch(() => "");
}

export async function streamChat(opts: ChatOptions): Promise<Response> {
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: true,
    options: { temperature: opts.temperature ?? 0.7 },
  };
  if (opts.tools && opts.tools.length) body.tools = opts.tools;
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama chat failed (status ${res.status}): ${text}`);
  }
  return res;
}

export async function pullModel(tag: string, onProgress: (line: string) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${OLLAMA_URL}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: tag, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Ollama pull failed (status ${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let streamError: string | null = null;
  // Ollama streams pull progress with HTTP 200 even when the model cannot be
  // pulled (for example a cloud-only model): it emits a line like
  // {"error":"pull model manifest: file does not exist"}. Detect that and throw
  // so callers report a real failure instead of a false success.
  const handle = (line: string) => {
    if (!line.trim()) return;
    onProgress(line);
    try {
      const j = JSON.parse(line) as { error?: string };
      if (j.error) streamError = j.error;
    } catch {
      /* non-JSON progress line */
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) handle(line);
  }
  handle(buf);
  if (streamError) throw new Error(streamError);
}

export async function deleteModel(tag: string): Promise<void> {
  const res = await fetch(`${OLLAMA_URL}/api/delete`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: tag }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama delete failed (status ${res.status}): ${text}`);
  }
}
