import type { AppConfig, CatalogModel, ChatDetail, ChatSummary, LocalModel, MachineInfo, PreparedUpload, RuntimeStatus } from "../types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(body.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  listChats: () => fetch("/api/chats").then((r) => json<ChatSummary[]>(r)),
  searchChats: (q: string) => fetch(`/api/chats/search?q=${encodeURIComponent(q)}`).then((r) => json<ChatSummary[]>(r)),
  createChat: () => fetch("/api/chats", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then((r) => json<ChatSummary>(r)),
  getChat: (id: string) => fetch(`/api/chats/${id}`).then((r) => json<ChatDetail>(r)),
  updateChat: (id: string, patch: { title?: string; pinned?: boolean }) =>
    fetch(`/api/chats/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).then((r) => json<ChatSummary>(r)),
  deleteChat: (id: string) => fetch(`/api/chats/${id}`, { method: "DELETE" }).then((r) => json<{ ok: boolean }>(r)),
  forkChat: (id: string, messageId?: string) =>
    fetch(`/api/chats/${id}/fork`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(messageId ? { messageId } : {}) }).then((r) => json<ChatSummary>(r)),
  revertChat: (id: string, messageId: string) =>
    fetch(`/api/chats/${id}/revert`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId }) }).then((r) => json<ChatDetail>(r)),

  listModels: () => fetch("/api/models").then((r) => json<{ models: LocalModel[] }>(r)),
  availableModels: (reservedRamGb?: number, refresh?: boolean) => {
    const params = new URLSearchParams();
    if (reservedRamGb != null) params.set("reservedRamGb", String(reservedRamGb));
    if (refresh) params.set("refresh", "true");
    const qs = params.toString();
    return fetch(`/api/models/available${qs ? `?${qs}` : ""}`).then((r) => json<{ machine: MachineInfo; models: CatalogModel[]; stale?: boolean }>(r));
  },
  deleteModel: (tag: string) => fetch(`/api/models/${encodeURIComponent(tag)}`, { method: "DELETE" }).then((r) => json<{ ok: boolean }>(r)),
  runtimeStatus: () => fetch("/api/models/runtime").then((r) => json<RuntimeStatus>(r)),
  unloadModels: (tag?: string) =>
    fetch("/api/models/unload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(tag ? { tag } : {}) }).then((r) => json<{ unloaded: string[]; loaded: boolean }>(r)),
  loadModel: (tag: string) =>
    fetch("/api/models/load", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag }) }).then((r) => json<{ loaded: boolean }>(r)),

  getConfig: () => fetch("/api/config").then((r) => json<AppConfig>(r)),
  updateConfig: (patch: Record<string, unknown>) =>
    fetch("/api/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).then((r) => json<AppConfig>(r)),

  async upload(files: File[]): Promise<{ files: PreparedUpload[]; rejected: string[] }> {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    return json(res);
  },
};
