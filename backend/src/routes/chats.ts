import { Router } from "express";
import { randomUUID } from "node:crypto";
import db from "../db.js";

const router = Router();

interface ChatRow {
  id: string;
  title: string;
  pinned: number;
  created_at: number;
  updated_at: number;
}

interface MessageRow {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  attachments: string | null;
  created_at: number;
}

// GET /api/chats - pinned first, then most recent
router.get("/", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, title, pinned, created_at, updated_at FROM chats
       ORDER BY pinned DESC, updated_at DESC`
    )
    .all() as ChatRow[];
  res.json(rows.map((r) => ({ ...r, pinned: !!r.pinned })));
});

// Escape LIKE wildcards so a user's literal % or _ does not act as a wildcard.
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => "\\" + m);
}

function buildSnippet(content: string, term: string): string {
  const idx = content.toLowerCase().indexOf(term.toLowerCase());
  if (idx < 0) return "";
  const start = Math.max(0, idx - 30);
  const end = Math.min(content.length, idx + term.length + 50);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < content.length ? "…" : "";
  return (prefix + content.slice(start, end).replace(/\s+/g, " ").trim() + suffix).slice(0, 160);
}

// GET /api/chats/search?q=... - match chats by title OR any message content.
// Returns chat summaries (pinned first, then most recent) plus a snippet of the
// matching message when the match was in the chat body.
router.get("/search", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    const rows = db.prepare(`SELECT id, title, pinned, created_at, updated_at FROM chats ORDER BY pinned DESC, updated_at DESC`).all() as ChatRow[];
    return res.json(rows.map((r) => ({ ...r, pinned: !!r.pinned })));
  }
  const like = `%${escapeLike(q)}%`;
  const rows = db
    .prepare(
      `SELECT c.id, c.title, c.pinned, c.created_at, c.updated_at,
              (SELECT m.content FROM messages m
                 WHERE m.chat_id = c.id AND m.content LIKE ? ESCAPE '\\' COLLATE NOCASE
                 ORDER BY m.created_at ASC LIMIT 1) AS match_content
         FROM chats c
        WHERE c.title LIKE ? ESCAPE '\\' COLLATE NOCASE
           OR EXISTS (SELECT 1 FROM messages m WHERE m.chat_id = c.id AND m.content LIKE ? ESCAPE '\\' COLLATE NOCASE)
        ORDER BY c.pinned DESC, c.updated_at DESC`
    )
    .all(like, like, like) as (ChatRow & { match_content: string | null })[];
  res.json(
    rows.map((r) => ({
      id: r.id,
      title: r.title,
      pinned: !!r.pinned,
      created_at: r.created_at,
      updated_at: r.updated_at,
      snippet: r.match_content ? buildSnippet(r.match_content, q) : undefined,
    }))
  );
});

// POST /api/chats - create
router.post("/", (req, res) => {
  const now = Date.now();
  const id = randomUUID();
  const title = typeof req.body?.title === "string" && req.body.title.trim() ? req.body.title.trim().slice(0, 200) : "New chat";
  db.prepare(
    `INSERT INTO chats (id, title, pinned, created_at, updated_at) VALUES (?, ?, 0, ?, ?)`
  ).run(id, title, now, now);
  res.status(201).json({ id, title, pinned: false, created_at: now, updated_at: now });
});

// GET /api/chats/:id - chat with messages
router.get("/:id", (req, res) => {
  const chat = db.prepare(`SELECT id, title, pinned, created_at, updated_at FROM chats WHERE id = ?`).get(req.params.id) as ChatRow | undefined;
  if (!chat) return res.status(404).json({ error: "Chat not found" });
  const messages = db
    .prepare(`SELECT id, role, content, attachments, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC`)
    .all(req.params.id) as MessageRow[];
  res.json({
    ...chat,
    pinned: !!chat.pinned,
    messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, created_at: m.created_at, ...decodeStored(m.attachments) })),
  });
});

// The attachments column stores either a user message's attachment array or an
// assistant message's { sources: [...] } wrapper. Decode to the right field.
function decodeStored(raw: string | null): { attachments: unknown[]; sources?: unknown[] } {
  if (!raw) return { attachments: [] };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { attachments: parsed };
    if (parsed && Array.isArray(parsed.sources)) return { attachments: [], sources: parsed.sources };
  } catch {
    /* fall through */
  }
  return { attachments: [] };
}

// PATCH /api/chats/:id - rename and/or pin
router.patch("/:id", (req, res) => {
  const chat = db.prepare(`SELECT id FROM chats WHERE id = ?`).get(req.params.id);
  if (!chat) return res.status(404).json({ error: "Chat not found" });
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (typeof req.body?.title === "string") {
    const t = req.body.title.trim();
    if (!t || t.length > 200) return res.status(400).json({ error: "Invalid title" });
    sets.push("title = ?");
    vals.push(t);
  }
  if (typeof req.body?.pinned === "boolean") {
    sets.push("pinned = ?");
    vals.push(req.body.pinned ? 1 : 0);
  }
  if (sets.length === 0) return res.status(400).json({ error: "Nothing to update" });
  sets.push("updated_at = ?");
  vals.push(Date.now());
  vals.push(req.params.id);
  db.prepare(`UPDATE chats SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  const updated = db.prepare(`SELECT id, title, pinned, created_at, updated_at FROM chats WHERE id = ?`).get(req.params.id) as ChatRow;
  res.json({ ...updated, pinned: !!updated.pinned });
});

// POST /api/chats/:id/fork - create a NEW chat copying this chat's history up to
// and including the given message (or the whole chat when no messageId is given).
// The original chat is left untouched.
router.post("/:id/fork", (req, res) => {
  const src = db.prepare(`SELECT id, title FROM chats WHERE id = ?`).get(req.params.id) as { id: string; title: string } | undefined;
  if (!src) return res.status(404).json({ error: "Chat not found" });

  const all = db
    .prepare(`SELECT id, role, content, attachments, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC`)
    .all(req.params.id) as MessageRow[];

  const messageId = typeof req.body?.messageId === "string" ? req.body.messageId : null;
  let slice = all;
  if (messageId) {
    const idx = all.findIndex((m) => m.id === messageId);
    if (idx < 0) return res.status(404).json({ error: "Message not found in this chat" });
    slice = all.slice(0, idx + 1);
  }

  const now = Date.now();
  const newId = randomUUID();
  const title = `${src.title} (fork)`.slice(0, 200);
  const insertMsg = db.prepare(`INSERT INTO messages (id, chat_id, role, content, attachments, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO chats (id, title, pinned, created_at, updated_at) VALUES (?, ?, 0, ?, ?)`).run(newId, title, now, now);
    for (const m of slice) {
      insertMsg.run(randomUUID(), newId, m.role, m.content, m.attachments, m.created_at);
    }
  });
  tx();
  res.status(201).json({ id: newId, title, pinned: false, created_at: now, updated_at: now });
});

// POST /api/chats/:id/revert - return the chat to a previous point by deleting
// every message after the given one (the given message is kept). Destructive.
router.post("/:id/revert", (req, res) => {
  const chat = db.prepare(`SELECT id FROM chats WHERE id = ?`).get(req.params.id);
  if (!chat) return res.status(404).json({ error: "Chat not found" });
  const messageId = typeof req.body?.messageId === "string" ? req.body.messageId : "";
  if (!messageId) return res.status(400).json({ error: "messageId is required" });

  const all = db.prepare(`SELECT id FROM messages WHERE chat_id = ? ORDER BY created_at ASC`).all(req.params.id) as { id: string }[];
  const idx = all.findIndex((m) => m.id === messageId);
  if (idx < 0) return res.status(404).json({ error: "Message not found in this chat" });

  const toDelete = all.slice(idx + 1).map((m) => m.id);
  const del = db.prepare(`DELETE FROM messages WHERE id = ?`);
  const tx = db.transaction(() => {
    for (const id of toDelete) del.run(id);
    db.prepare(`UPDATE chats SET updated_at = ? WHERE id = ?`).run(Date.now(), req.params.id);
  });
  tx();

  const updated = db.prepare(`SELECT id, title, pinned, created_at, updated_at FROM chats WHERE id = ?`).get(req.params.id) as ChatRow;
  const messages = db
    .prepare(`SELECT id, role, content, attachments, created_at FROM messages WHERE chat_id = ? ORDER BY created_at ASC`)
    .all(req.params.id) as MessageRow[];
  res.json({
    ...updated,
    pinned: !!updated.pinned,
    messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, created_at: m.created_at, ...decodeStored(m.attachments) })),
  });
});

// DELETE /api/chats/:id
router.delete("/:id", (req, res) => {
  const info = db.prepare(`DELETE FROM chats WHERE id = ?`).run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Chat not found" });
  res.json({ ok: true });
});

export default router;
