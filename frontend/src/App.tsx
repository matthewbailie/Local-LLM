import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import ChatInput from "./components/ChatInput";
import Message from "./components/Message";
import ModelLibrary from "./components/ModelLibrary";
import SettingsModal from "./components/SettingsModal";
import ApprovalCard from "./components/ApprovalCard";
import LlmStatus from "./components/LlmStatus";
import InstructionsModal from "./components/InstructionsModal";
import { api } from "./lib/api";
import type { ApprovalAction, AppConfig, ChatSummary, LocalModel, Message as Msg, PreparedUpload, Source } from "./types";

interface Pending {
  id: string;
  action: ApprovalAction;
}

// A message the user sent while a reply was still generating. Queued messages
// are sent automatically, in order, once the model is free.
interface QueuedMessage {
  id: string;
  content: string;
  uploads: PreparedUpload[];
}

// Apply the theme by toggling the `dark` class on <html>. "system" follows the OS.
function applyTheme(theme: string) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export default function App() {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [models, setModels] = useState<LocalModel[]>([]);
  const [activeModel, setActiveModel] = useState("");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop-only: collapse/expand the chat history pane. Mobile uses sidebarOpen.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [llmLoaded, setLlmLoaded] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const [queued, setQueued] = useState<QueuedMessage[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const streamChatRef = useRef<string | null>(null);
  // Mirrors `streaming` synchronously so send/queue decisions don't race React state.
  const streamingRef = useRef(false);
  const queueRef = useRef<QueuedMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const configRef = useRef<AppConfig | null>(null);

  const refreshChats = useCallback(async () => {
    try {
      setChats(await api.listChats());
    } catch {
      setBanner("Could not load chats. Is the backend running?");
    }
  }, []);

  const refreshModels = useCallback(async () => {
    try {
      const { models } = await api.listModels();
      setModels(models);
      setActiveModel((cur) => (cur && models.some((m) => m.tag === cur) ? cur : models[0]?.tag ?? ""));
    } catch {
      setBanner("Ollama is not reachable. Start it with: brew services start ollama");
    }
  }, []);

  useEffect(() => {
    refreshChats();
    refreshModels();
    api
      .getConfig()
      .then((c) => {
        setConfig(c);
        setActiveModel((cur) => cur || c.defaultModel);
      })
      .catch(() => undefined);
  }, [refreshChats, refreshModels]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  // Apply the chosen theme (light / dark / system). Persist to localStorage so the
  // boot script in index.html can apply it before paint on the next load, and
  // follow OS changes live while set to "system".
  useEffect(() => {
    const theme = config?.theme ?? "system";
    applyTheme(theme);
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* ignore storage errors */
    }
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [config?.theme]);

  const refreshRuntime = useCallback(async () => {
    try {
      const r = await api.runtimeStatus();
      setLlmLoaded(r.loaded);
    } catch {
      setLlmLoaded(false);
    }
  }, []);

  const unloadLlm = useCallback(async () => {
    try {
      await api.unloadModels();
      setLlmLoaded(false);
    } catch {
      setBanner("Could not free RAM. Is Ollama running?");
    }
  }, []);

  const loadLlm = useCallback(
    async (tag: string) => {
      if (!tag) return;
      setLlmLoading(true);
      try {
        await api.loadModel(tag);
        setLlmLoaded(true);
      } catch {
        setBanner("Could not load the model into memory.");
      } finally {
        setLlmLoading(false);
      }
    },
    [],
  );

  const toggleLlm = useCallback(() => {
    if (llmLoaded) unloadLlm();
    else loadLlm(activeModel);
  }, [llmLoaded, unloadLlm, loadLlm, activeModel]);

  // Poll LLM runtime status; also refresh when the tab regains focus.
  useEffect(() => {
    refreshRuntime();
    const id = window.setInterval(refreshRuntime, 12000);
    const onFocus = () => refreshRuntime();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshRuntime]);

  // Unload the model when the page is closed, if enabled in Settings.
  useEffect(() => {
    const onUnload = () => {
      if (configRef.current?.unloadOnClose) {
        navigator.sendBeacon?.("/api/models/unload", new Blob(["{}"], { type: "application/json" }));
      }
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, []);

  // Idle auto-unload: when enabled, free RAM after the configured idle minutes.
  useEffect(() => {
    if (!config?.unloadAfterIdle) return;
    const idleMs = Math.max(1, config.idleMinutes) * 60_000;
    const id = window.setInterval(() => {
      if (streaming) return;
      if (llmLoaded && Date.now() - lastActivityRef.current >= idleMs) unloadLlm();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [config?.unloadAfterIdle, config?.idleMinutes, streaming, llmLoaded, unloadLlm]);

  // When the LLM RAM budget changes (or models change), make sure the selected
  // model still fits. If it no longer fits, switch to the largest model that does.
  useEffect(() => {
    if (!config) return;
    const budget = config.machine.modelBudgetGb;
    if (!budget) return;
    const fits = (m: LocalModel) => !m.ramGb || m.ramGb <= budget;
    const current = models.find((m) => m.tag === activeModel);
    if (current && !fits(current)) {
      const next = models.filter(fits).sort((a, b) => (b.ramGb ?? 0) - (a.ramGb ?? 0))[0];
      if (next) {
        setActiveModel(next.tag);
        setBanner(`Switched to ${next.tag}. The previous model needs more RAM than the current LLM budget (${budget} GB) allows.`);
      }
    }
  }, [config, models, activeModel]);

  const selectChat = async (id: string) => {
    setActiveId(id);
    streamChatRef.current = id;
    setSidebarOpen(false);
    try {
      const detail = await api.getChat(id);
      setMessages(detail.messages);
    } catch {
      setMessages([]);
    }
  };

  const newChat = async () => {
    const chat = await api.createChat();
    await refreshChats();
    setActiveId(chat.id);
    setMessages([]);
    setSidebarOpen(false);
    // Starting a new chat turns the LLM back on if it was unloaded.
    if (!llmLoaded && !llmLoading && activeModel) loadLlm(activeModel);
  };

  // --- Pure state updaters (safe under StrictMode double-invocation) -------
  const appendToken = (delta: string) =>
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return prev;
      return [...prev.slice(0, -1), { ...last, content: last.content + delta, loadingModel: false }];
    });

  const addToolActivity = (tool: string, label: string) =>
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return prev;
      return [...prev.slice(0, -1), { ...last, loadingModel: false, toolActivity: [...(last.toolActivity ?? []), { tool, label }] }];
    });

  const setSources = (sources: Source[]) =>
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return prev;
      return [...prev.slice(0, -1), { ...last, sources }];
    });

  const markDone = () =>
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role !== "assistant") return prev;
      return [...prev.slice(0, -1), { ...last, streaming: false }];
    });

  const handleEvent = (j: Record<string, unknown>) => {
    switch (j.type) {
      case "token":
        appendToken(String(j.content ?? ""));
        break;
      case "tool_activity":
        addToolActivity(String(j.tool ?? "tool"), String(j.label ?? ""));
        break;
      case "sources":
        setSources((j.sources as Source[]) ?? []);
        break;
      case "approval_request": {
        const p = { id: String(j.id), action: j.action as ApprovalAction };
        pendingRef.current = p;
        setPending(p);
        break;
      }
      case "notice":
        setBanner(String(j.message ?? ""));
        break;
      case "error":
        setBanner(String(j.error ?? "The model request failed."));
        break;
      case "done":
        if (Array.isArray(j.sources) && (j.sources as Source[]).length) setSources(j.sources as Source[]);
        break;
    }
  };

  const readStream = async (response: Response) => {
    if (!response.body) throw new Error("No response stream");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          handleEvent(JSON.parse(line));
        } catch {
          /* ignore partial */
        }
      }
    }
  };

  const finishStreaming = () => {
    setStreaming(false);
    streamingRef.current = false;
    abortRef.current = null;
    lastActivityRef.current = Date.now();
    markDone();
    refreshChats();
    refreshRuntime();
    // Reload from the server so messages carry their real database IDs (needed
    // for per-message Copy/Revert/Fork) and persisted sources. Once the visible
    // history matches the server, send the next queued message (if any).
    const id = streamChatRef.current;
    if (id) {
      api
        .getChat(id)
        .then((detail) => {
          if (streamChatRef.current === id) setMessages(detail.messages);
        })
        .catch(() => undefined)
        .finally(() => drainQueue());
    } else {
      drainQueue();
    }
  };

  // Send the next queued message, in order, once the model is free.
  const drainQueue = () => {
    if (streamingRef.current) return;
    const next = queueRef.current[0];
    if (!next) return;
    queueRef.current = queueRef.current.slice(1);
    setQueued(queueRef.current);
    void runSend(next.content, next.uploads);
  };

  const cancelQueued = (id: string) => {
    queueRef.current = queueRef.current.filter((q) => q.id !== id);
    setQueued(queueRef.current);
  };

  // Public entry point from the input box: run now if idle, otherwise queue.
  const send = (content: string, uploads: PreparedUpload[]) => {
    if (!activeModel) {
      setBanner("No model selected. Open 'Manage LLMs' to download one.");
      return;
    }
    if (streamingRef.current) {
      const item: QueuedMessage = { id: "q-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6), content, uploads };
      queueRef.current = [...queueRef.current, item];
      setQueued(queueRef.current);
      return;
    }
    void runSend(content, uploads);
  };

  const runSend = async (content: string, uploads: PreparedUpload[]) => {
    let chatId = activeId;
    if (!chatId) {
      const chat = await api.createChat();
      chatId = chat.id;
      setActiveId(chat.id);
      await refreshChats();
    }
    streamChatRef.current = chatId;

    const attachments = uploads.map((u) => ({ name: u.name, type: u.type, size: u.size, kind: u.kind }));
    const needsLoad = !llmLoaded;
    const userMsg: Msg = { id: "tmp-" + Date.now(), role: "user", content, attachments, created_at: Date.now() };
    const asstMsg: Msg = { id: "tmp-asst-" + Date.now(), role: "assistant", content: "", created_at: Date.now(), streaming: true, loadingModel: needsLoad };
    setMessages((m) => [...m, userMsg, asstMsg]);
    setStreaming(true);
    streamingRef.current = true;
    lastActivityRef.current = Date.now();
    setLlmLoaded(true);

    const controller = new AbortController();
    abortRef.current = controller;
    pendingRef.current = null;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          chatId,
          model: activeModel,
          userMessage: {
            content,
            images: uploads.filter((u) => u.kind === "image" && u.dataBase64).map((u) => u.dataBase64),
            textFiles: uploads.filter((u) => u.kind === "text" && u.textContent).map((u) => ({ name: u.name, content: u.textContent })),
            attachments,
          },
        }),
      });
      await readStream(res);
      if (!pendingRef.current) finishStreaming();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) setBanner("The request failed. Check that Ollama is running.");
      finishStreaming();
    }
  };

  const resolveApproval = async (approved: boolean) => {
    const p = pendingRef.current;
    if (!p) return;
    pendingRef.current = null;
    setPending(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch("/api/chat/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ id: p.id, approved }),
      });
      await readStream(res);
      if (!pendingRef.current) finishStreaming();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) setBanner("Could not resume after approval.");
      finishStreaming();
    }
  };

  const stop = () => {
    // Stop means stop everything: cancel the in-flight reply and clear the queue.
    queueRef.current = [];
    setQueued([]);
    abortRef.current?.abort();
    pendingRef.current = null;
    setPending(null);
  };

  const rename = async (id: string, title: string) => {
    await api.updateChat(id, { title });
    refreshChats();
  };
  const pin = async (id: string, pinned: boolean) => {
    await api.updateChat(id, { pinned });
    refreshChats();
  };
  const remove = async (id: string) => {
    await api.deleteChat(id);
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
    refreshChats();
  };

  // Fork a whole chat from the sidebar: new chat with all of its history.
  const forkChatWhole = async (id: string) => {
    try {
      const chat = await api.forkChat(id);
      await refreshChats();
      await selectChat(chat.id);
      setBanner("Forked into a new chat with the full history.");
    } catch {
      setBanner("Could not fork this chat.");
    }
  };

  // Fork from a message: create a new chat with the history up to that message.
  const forkFrom = async (messageId: string) => {
    if (!activeId || streaming) return;
    try {
      const chat = await api.forkChat(activeId, messageId);
      await refreshChats();
      await selectChat(chat.id);
      setBanner("Forked into a new chat with the history up to that message.");
    } catch {
      setBanner("Could not fork this chat.");
    }
  };

  // Revert to a message: delete everything after it in the current chat.
  const revertTo = async (messageId: string) => {
    if (!activeId || streaming) return;
    if (!window.confirm("Revert the chat to this message? Everything after it will be permanently deleted.")) return;
    try {
      const detail = await api.revertChat(activeId, messageId);
      setMessages(detail.messages);
      refreshChats();
    } catch {
      setBanner("Could not revert this chat.");
    }
  };

  return (
    <div className="flex h-full bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-72 transform overflow-hidden border-slate-200 transition-[transform,width] duration-200 ease-out dark:border-slate-800 md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarCollapsed ? "md:w-0 md:border-r-0" : "border-r md:w-72"}`}
      >
        {/* Fixed-width inner content so the aside width can animate to 0 (clipping
            the content) instead of squishing it when the pane collapses. */}
        <div className="h-full w-72">
          <Sidebar
            chats={chats}
            activeId={activeId}
            onSelect={selectChat}
            onNew={newChat}
            onRename={rename}
            onPin={pin}
            onFork={forkChatWhole}
            onDelete={remove}
            onOpenLibrary={() => setShowLibrary(true)}
            onOpenSettings={() => setShowSettings(true)}
            onOpenInstructions={() => setShowInstructions(true)}
          />
        </div>
      </aside>
      {sidebarOpen && <div className="anim-fade-in fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          {/* Desktop: collapse/expand the chat history pane. */}
          <button
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="hidden rounded-md p-1.5 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-accent dark:hover:bg-slate-800 md:inline-flex"
            aria-label={sidebarCollapsed ? "Show chat history" : "Hide chat history"}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? "Show chat history" : "Hide chat history"}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <line x1="9" y1="4" x2="9" y2="20" />
            </svg>
          </button>
          {/* Mobile: open the chat history drawer. */}
          <button
            onClick={() => setSidebarOpen((s) => !s)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-accent dark:hover:bg-slate-800 md:hidden"
            aria-label="Open chat history menu"
          >
            ☰
          </button>
          <h1 className="truncate text-sm font-semibold">{chats.find((c) => c.id === activeId)?.title ?? "Free AI Forever"}</h1>
          <div className="ml-auto flex items-center gap-3">
            <LlmStatus loaded={llmLoaded} busy={streaming} loading={llmLoading} onToggle={toggleLlm} />
          </div>
        </header>

        {banner && (
          <div className="flex items-start justify-between gap-3 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            <span>{banner}</span>
            <button onClick={() => setBanner(null)} className="text-amber-600 hover:text-amber-800 dark:text-amber-300" aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {messages.length === 0 && (
              <div className="mt-20 text-center text-slate-400">
                <p className="text-2xl">💬</p>
                <p className="mt-2 text-sm">Start a conversation with your local model.</p>
                <p className="text-xs">It can search the web and work with files in its working directory.</p>
              </div>
            )}
            {messages.map((m) => (
              <Message key={m.id} message={m} canAct={!streaming} onFork={forkFrom} onRevert={revertTo} />
            ))}
            {pending && <ApprovalCard action={pending.action} onApprove={() => resolveApproval(true)} onDeny={() => resolveApproval(false)} />}
          </div>
        </div>

        <ChatInput streaming={streaming} queued={queued} models={models} activeModel={activeModel} llmBudgetGb={config?.machine.modelBudgetGb ?? 0} onModelChange={setActiveModel} onSend={send} onStop={stop} onCancelQueued={cancelQueued} />
      </main>

      {showLibrary && config && <ModelLibrary reservedRamGb={config.machine.reservedRamGb} onClose={() => setShowLibrary(false)} onModelsChanged={refreshModels} />}
      {showSettings && config && <SettingsModal config={config} onClose={() => setShowSettings(false)} onSaved={(c) => setConfig(c)} />}
      {showInstructions && <InstructionsModal onClose={() => setShowInstructions(false)} />}
    </div>
  );
}
