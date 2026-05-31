import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { ChatSummary } from "../types";

interface Props {
  chats: ChatSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onFork: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenLibrary: () => void;
  onOpenSettings: () => void;
  onOpenInstructions: () => void;
}

interface MenuState {
  id: string;
  x: number;
  y: number;
}

export default function Sidebar({ chats, activeId, onSelect, onNew, onRename, onPin, onFork, onDelete, onOpenLibrary, onOpenSettings, onOpenInstructions }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatSummary[] | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const close = () => setMenu(null);
    if (menu) {
      window.addEventListener("click", close);
      window.addEventListener("scroll", close, true);
      return () => {
        window.removeEventListener("click", close);
        window.removeEventListener("scroll", close, true);
      };
    }
  }, [menu]);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  // Search titles AND message content via the backend (debounced). Empty query
  // falls back to the full chat list passed in as a prop.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      api
        .searchChats(q)
        .then((r) => {
          if (!cancelled) setResults(r);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [query, chats]);

  const filtered = query.trim() ? results ?? [] : chats;

  const startEdit = (c: ChatSummary) => {
    setMenu(null);
    setEditingId(c.id);
    setEditValue(c.title);
  };

  const commitEdit = () => {
    if (editingId && editValue.trim()) onRename(editingId, editValue.trim());
    setEditingId(null);
  };

  const confirmDelete = (id: string) => {
    setMenu(null);
    if (window.confirm("Delete this chat? This cannot be undone.")) onDelete(id);
  };

  // Open the menu anchored to the three-dots button (right-aligned, just below it).
  const openMenuFromDots = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const MENU_WIDTH = 160; // matches w-40
    setMenu({ id, x: Math.max(8, rect.right - MENU_WIDTH), y: rect.bottom + 4 });
  };

  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-900">
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={onNew}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <span className="text-lg leading-none">+</span> New chat
        </button>
      </div>

      <div className="px-3 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <nav className="flex-1 overflow-y-auto px-2" aria-label="Chat history">
        {filtered.length === 0 && <p className="px-3 py-6 text-center text-sm text-slate-400">{query.trim() ? "No chats match your search." : "No chats yet."}</p>}
        <ul className="space-y-0.5">
          {filtered.map((c) => (
            <li key={c.id}>
              {editingId === c.id ? (
                <input
                  ref={editRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="w-full rounded-md border border-accent bg-white px-2.5 py-2 text-sm text-slate-900 focus:outline-none dark:bg-slate-800 dark:text-slate-100"
                />
              ) : (
                <div className="group relative">
                  <button
                    onClick={() => onSelect(c.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ id: c.id, x: e.clientX, y: e.clientY });
                    }}
                    aria-current={activeId === c.id ? "true" : undefined}
                    className={`flex w-full items-start gap-2 rounded-md py-2 pl-2.5 pr-8 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-accent ${
                      activeId === c.id
                        ? "bg-accent/10 font-medium text-accent dark:bg-accent/20"
                        : "text-slate-800 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    {c.pinned && <span className="shrink-0 text-amber-500" aria-label="Pinned">📌</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{c.title}</span>
                      {c.snippet && <span className="mt-0.5 block truncate text-xs text-slate-400 dark:text-slate-500">{c.snippet}</span>}
                    </span>
                  </button>
                  <button
                    onClick={(e) => openMenuFromDots(e, c.id)}
                    aria-label="Chat options"
                    aria-haspopup="menu"
                    className={`absolute right-1 top-1.5 flex h-7 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200 ${
                      menu?.id === c.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                    }`}
                  >
                    <span aria-hidden className="text-lg leading-none">⋮</span>
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-1 border-t border-slate-200 p-3 dark:border-slate-700">
        <button
          onClick={onOpenLibrary}
          className="flex w-full items-center gap-2 rounded-md border border-accent/30 bg-accent/10 px-2.5 py-2 text-left text-sm font-medium text-accent transition hover:bg-accent/20 focus:outline-none focus:ring-2 focus:ring-accent dark:bg-accent/15 dark:hover:bg-accent/25"
        >
          ⬇️ Manage LLMs
        </button>
        <button
          onClick={onOpenInstructions}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-accent dark:text-slate-200 dark:hover:bg-slate-800"
        >
          ❓ How to
        </button>
        <button
          onClick={onOpenSettings}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-accent dark:text-slate-200 dark:hover:bg-slate-800"
        >
          ⚙️ Settings
        </button>
      </div>

      {menu && (
        <div
          role="menu"
          className="anim-menu-in fixed z-50 w-40 origin-top overflow-hidden rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            role="menuitem"
            onClick={() => {
              const c = chats.find((x) => x.id === menu.id);
              if (c) onPin(c.id, !c.pinned);
              setMenu(null);
            }}
            className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {chats.find((x) => x.id === menu.id)?.pinned ? "Unpin" : "Pin"}
          </button>
          <button
            role="menuitem"
            onClick={() => {
              const c = chats.find((x) => x.id === menu.id);
              if (c) startEdit(c);
            }}
            className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Rename
          </button>
          <button
            role="menuitem"
            onClick={() => {
              onFork(menu.id);
              setMenu(null);
            }}
            className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Fork
          </button>
          <button
            role="menuitem"
            onClick={() => confirmDelete(menu.id)}
            className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
