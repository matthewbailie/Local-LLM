import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Message as MessageType } from "../types";

interface Props {
  message: MessageType;
  canAct?: boolean;
  onFork?: (messageId: string) => void;
  onRevert?: (messageId: string) => void;
}

export default function Message({ message, canAct = false, onFork, onRevert }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  // Actions need a real persisted message id (temporary streaming ids start with "tmp-").
  const persisted = !message.id.startsWith("tmp-") && !message.streaming;
  const actionsEnabled = canAct && persisted;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className={`group flex w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[85%] flex-col ${isUser ? "items-end" : "items-start"}`}>
        <div className={`rounded-2xl px-4 py-3 ${isUser ? "bg-accent text-accent-fg" : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"}`}>
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {message.attachments.map((a, i) => (
              <span key={i} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs ${isUser ? "bg-white/25" : "bg-slate-200 dark:bg-slate-700"}`}>
                {a.kind === "image" ? "🖼" : "📄"} {a.name}
              </span>
            ))}
          </div>
        )}

        {/* Agent tool activity */}
        {!isUser && message.toolActivity && message.toolActivity.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            {message.toolActivity.map((t, i) => (
              <span key={i} className="inline-flex w-fit items-center gap-1.5 rounded-md bg-slate-200/70 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700/70 dark:text-slate-300">
                <span className="text-[10px]">⚙</span> {t.label}
              </span>
            ))}
          </div>
        )}

        {isUser ? (
          <div className="whitespace-pre-wrap break-words leading-relaxed">{message.content}</div>
        ) : (
          <div className="markdown break-words text-[0.95rem]">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
              {message.content}
            </ReactMarkdown>
            {message.streaming && message.content.length === 0 && (
              message.loadingModel ? (
                <span className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                  Loading model into memory…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1" aria-label="Working">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                </span>
              )
            )}
          </div>
        )}

        {/* Web source citations */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="mt-3 border-t border-slate-200 pt-2 dark:border-slate-700">
            <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Sources</p>
            <ol className="space-y-0.5">
              {message.sources.map((s, i) => (
                <li key={i} className="truncate text-xs">
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        )}

        </div>

        {/* Per-message actions: copy, revert to here, fork into a new chat */}
        {!message.streaming && message.content && (
          <div className="mt-1 flex w-full items-center justify-end gap-0.5 text-slate-400 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
            <button onClick={copy} aria-label="Copy message" title="Copy" className="rounded-md p-1 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent dark:hover:bg-slate-800 dark:hover:text-slate-200">
              {copied ? <span className="text-xs">Copied</span> : <span aria-hidden className="text-sm">⧉</span>}
            </button>
            {onRevert && (
              <button
                onClick={() => onRevert(message.id)}
                disabled={!actionsEnabled}
                aria-label="Revert chat to this message"
                title="Revert to here (deletes later messages)"
                className="rounded-md p-1 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <span aria-hidden className="text-sm">↩</span>
              </button>
            )}
            {onFork && (
              <button
                onClick={() => onFork(message.id)}
                disabled={!actionsEnabled}
                aria-label="Fork a new chat from this message"
                title="Fork into a new chat (keeps history up to here)"
                className="rounded-md p-1 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              >
                <span aria-hidden className="text-sm">⑂</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
