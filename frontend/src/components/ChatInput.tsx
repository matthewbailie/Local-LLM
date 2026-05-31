import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { LocalModel, PreparedUpload } from "../types";

interface QueuedMessage {
  id: string;
  content: string;
  uploads: PreparedUpload[];
}

interface Props {
  streaming: boolean;
  queued: QueuedMessage[];
  models: LocalModel[];
  activeModel: string;
  llmBudgetGb: number;
  onModelChange: (tag: string) => void;
  onSend: (content: string, uploads: PreparedUpload[]) => void;
  onStop: () => void;
  onCancelQueued: (id: string) => void;
}

const MAX_LINES = 15;

function isVisionModel(tag: string): boolean {
  return /vision|-vl|llava|minicpm-v/i.test(tag);
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function modelFits(m: LocalModel, budgetGb: number): boolean {
  if (!budgetGb || !m.ramGb) return true;
  return m.ramGb <= budgetGb;
}

export default function ChatInput({ streaming, queued, models, activeModel, llmBudgetGb, onModelChange, onSend, onStop, onCancelQueued }: Props) {
  const [text, setText] = useState("");
  const [uploads, setUploads] = useState<PreparedUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const dragDepth = useRef(0);

  const resize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(ta).lineHeight || "24");
    const maxHeight = lineHeight * MAX_LINES + 16;
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + "px";
    ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden";
  };

  useEffect(resize, [text]);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      const res = await api.upload(files);
      setUploads((u) => [...u, ...res.files]);
      if (res.rejected.length) setError(`Skipped unsupported file(s): ${res.rejected.join(", ")}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length) {
      e.preventDefault();
      handleFiles(files);
    }
  };

  // While a reply is streaming this queues the message instead of blocking.
  const send = () => {
    const trimmed = text.trim();
    if (!trimmed && uploads.length === 0) return;
    onSend(trimmed, uploads);
    setText("");
    setUploads([]);
  };
  const hasContent = !!text.trim() || uploads.length > 0;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const hasImage = uploads.some((u) => u.kind === "image");
  const visionWarning = hasImage && activeModel && !isVisionModel(activeModel);

  return (
    <div
      className="relative border-t border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900"
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current -= 1;
        if (dragDepth.current <= 0) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent/10 text-sm font-medium text-accent dark:bg-accent/15">
          Drop files or images to attach
        </div>
      )}

      <div className="mx-auto max-w-3xl">
        {queued.length > 0 && (
          <div className="mb-2 space-y-1">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Queued ({queued.length}) - sent automatically when the model is free</p>
            {queued.map((q, i) => (
              <div key={q.id} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <span className="shrink-0 text-slate-400">{i + 1}.</span>
                <span className="flex-1 truncate">{q.content || "(attachment only)"}{q.uploads.length > 0 ? ` · ${q.uploads.length} file(s)` : ""}</span>
                <button onClick={() => onCancelQueued(q.id)} className="shrink-0 rounded p-0.5 text-slate-400 transition hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-accent" aria-label="Remove queued message">
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
        {visionWarning && (
          <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
            The active model can't see images. Switch to (or install) a vision model like <code>llama3.2-vision</code> or <code>qwen2.5-vl</code>. Text files still work.
          </p>
        )}

        {uploads.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {uploads.map((u, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {u.kind === "image" ? "🖼" : "📄"} {u.name} <span className="text-slate-400">({fmtSize(u.size)})</span>
                <button onClick={() => setUploads((arr) => arr.filter((_, idx) => idx !== i))} className="ml-0.5 text-slate-400 hover:text-red-500" aria-label={`Remove ${u.name}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-white px-3 py-2 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent dark:border-slate-600 dark:bg-slate-800">
          <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-lg text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-700" title="Attach files or images">
            {uploading ? <span className="spin">⏳</span> : "📎"}
            <input type="file" multiple className="hidden" onChange={(e) => handleFiles(Array.from(e.target.files ?? []))} />
          </label>

          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            rows={1}
            placeholder={streaming ? "Type to queue the next message. Enter to queue, Shift+Enter for a new line." : "Send a message. Enter to send, Shift+Enter for a new line. Drag, paste, or attach files."}
            className="max-h-[400px] flex-1 resize-none bg-transparent py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
          />

          {streaming ? (
            <div className="flex shrink-0 items-center gap-2">
              {hasContent && (
                <button
                  onClick={send}
                  className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent"
                  title="Queue this message - it sends when the model is free"
                  aria-label="Queue message"
                >
                  ↑ Queue
                </button>
              )}
              <button onClick={onStop} className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-slate-700 px-3 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-accent">
                <span className="h-2.5 w-2.5 rounded-sm bg-white" /> Stop
              </button>
            </div>
          ) : (
            <button
              onClick={send}
              disabled={!text.trim() && uploads.length === 0}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send message"
            >
              ↑
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <label htmlFor="model-select" className="text-xs text-slate-500 dark:text-slate-400">
            Model:
          </label>
          <select
            id="model-select"
            value={activeModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {models.length === 0 && <option value="">No models installed</option>}
            {models.map((m) => {
              const fits = modelFits(m, llmBudgetGb);
              const ram = m.ramGb ? ` · ~${m.ramGb} GB` : "";
              return (
                <option key={m.tag} value={m.tag} disabled={!fits}>
                  {m.tag}
                  {ram}
                  {fits ? "" : " — needs more RAM"}
                </option>
              );
            })}
          </select>
          {(() => {
            const active = models.find((m) => m.tag === activeModel);
            if (active && !modelFits(active, llmBudgetGb)) {
              return (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Needs ~{active.ramGb} GB - more than the {llmBudgetGb} GB LLM budget. Increase the budget in Settings or pick a smaller model.
                </span>
              );
            }
            return null;
          })()}
        </div>
      </div>
    </div>
  );
}
