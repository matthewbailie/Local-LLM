import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useOnEscape } from "../lib/useOnEscape";
import { useDismissAnimation } from "../lib/useDismissAnimation";
import type { CatalogModel, MachineInfo } from "../types";

interface Props {
  reservedRamGb: number;
  onClose: () => void;
  onModelsChanged: () => void;
}

interface Progress {
  percent: number;
  status: string;
}

export default function ModelLibrary({ reservedRamGb, onClose, onModelsChanged }: Props) {
  const [models, setModels] = useState<CatalogModel[]>([]);
  const [machine, setMachine] = useState<MachineInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [pullErrors, setPullErrors] = useState<Record<string, string>>({});
  const [typeFilter, setTypeFilter] = useState("all");
  const { closing, dismiss } = useDismissAnimation();
  const close = () => dismiss(onClose);
  useOnEscape(close);

  // refresh=true forces an internet check for newly published models.
  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await api.availableModels(reservedRamGb, refresh);
      // Newest recommended first, then models that fit, then the rest.
      const sorted = [...data.models].sort((a, b) => Number(!!b.isLatest) - Number(!!a.isLatest) || Number(b.fits) - Number(a.fits));
      setModels(sorted);
      setMachine(data.machine);
      setError(null);
      if (refresh) setNotice(data.stale ? "Could not reach the internet - showing the models already known." : "Model list updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load models");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Live refresh every time the panel opens.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Distinct model families present, for the type filter dropdown.
  const families = [...new Set(models.map((m) => m.family).filter((f): f is string => !!f))].sort();
  const visibleModels = typeFilter === "all" ? models : models.filter((m) => m.family === typeFilter);

  const pull = async (tag: string) => {
    setPullErrors((e) => {
      const next = { ...e };
      delete next[tag];
      return next;
    });
    setProgress((p) => ({ ...p, [tag]: { percent: 0, status: "starting" } }));
    let failure: string | null = null;
    try {
      const res = await fetch("/api/models/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag }) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Unknown model tag.");
      }
      if (!res.body) throw new Error("No stream");
      const reader = res.body.getReader();
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
            const j = JSON.parse(line);
            if (j.error) failure = j.error;
            else if (j.total && j.completed) setProgress((p) => ({ ...p, [tag]: { percent: Math.round((j.completed / j.total) * 100), status: j.status ?? "downloading" } }));
            else if (j.status) setProgress((p) => ({ ...p, [tag]: { percent: p[tag]?.percent ?? 0, status: j.status } }));
          } catch {
            /* ignore partial */
          }
        }
      }
    } catch (e) {
      failure = e instanceof Error ? e.message : "Download failed.";
    }
    setProgress((p) => {
      const next = { ...p };
      delete next[tag];
      return next;
    });
    if (failure) {
      setPullErrors((e) => ({ ...e, [tag]: failure as string }));
    } else {
      await load();
      onModelsChanged();
    }
  };

  const remove = async (tag: string) => {
    if (!window.confirm(`Remove ${tag} from disk? You can download it again later.`)) return;
    try {
      await api.deleteModel(tag);
      await load();
      onModelsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove model");
    }
  };

  return (
    <div className={`fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 ${closing ? "anim-fade-out" : "anim-fade-in"}`} onClick={close}>
      <div role="dialog" aria-modal="true" aria-label="Model library" className={`flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900 ${closing ? "anim-panel-out" : "anim-panel-in"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Model library</h2>
            {machine && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Your budget: ~{machine.modelBudgetGb} GB RAM (reserving {machine.reservedRamGb} GB), {machine.freeDiskGb} GB free disk
              </p>
            )}
            <p className="text-xs text-slate-400">
              Change how much RAM the LLM can use in <strong>Settings</strong> → "RAM reserved for the LLM". A bigger budget lets run larger models locally.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">🌐 Internet</span> = can search the web and fetch pages. <span className="font-medium text-slate-500">No internet</span> models answer only from what they already know.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              title="Check the internet for newly published open-source models"
            >
              <span className={refreshing ? "spin" : ""} aria-hidden>↻</span>
              {refreshing ? "Checking…" : "Refresh"}
            </button>
            <button onClick={close} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-accent dark:hover:bg-slate-800" aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <span>Model type</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="all">All types</option>
              {families.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          {notice && <span className="text-xs text-slate-500 dark:text-slate-400">{notice}</span>}
          <span className="ml-auto text-xs text-slate-400">Not seeing a model? Click <strong>Refresh</strong> to check the internet for more.</span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {loading && <p className="text-sm text-slate-500">Loading…</p>}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {!loading && !error && models.length === 0 && (
            <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
              No models are listed. Click <strong>Refresh</strong> above to check the internet for available open-source models.
            </div>
          )}
          {!loading && models.length > 0 && visibleModels.length === 0 && <p className="text-sm text-slate-500">No models match this type.</p>}
          {visibleModels.map((m) => {
            const prog = progress[m.tag];
            return (
              <div key={m.tag} className={`rounded-xl border p-4 ${m.isLatest ? "border-accent/40 bg-accent/5 ring-1 ring-accent/20" : "border-slate-200 dark:border-slate-700"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-slate-900 dark:text-slate-100">{m.name}</h3>
                      {m.isLatest && <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-fg">LATEST {m.family ?? ""}</span>}
                      {m.discovered && <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-white dark:text-slate-900">NEW</span>}
                      {m.vision && <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">VISION</span>}
                      {m.toolCalling ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" title="Can search the web and fetch pages">🌐 INTERNET</span>
                      ) : (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400" title="Answers only from what it already knows; cannot access the internet">NO INTERNET</span>
                      )}
                      {m.installed && <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/40 dark:text-green-300">INSTALLED</span>}
                      {!m.fits && !m.installed && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{!m.fitsRam ? "EXCEEDS RAM BUDGET" : "LOW DISK"}</span>}
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{m.description}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {m.tag}
                      {m.downloadSizeGb > 0 ? ` · ${m.downloadSizeGb} GB download` : " · size varies"}
                      {m.ramGb > 0 ? ` · ~${m.ramGb} GB RAM` : ""}
                    </p>
                  </div>

                  <div className="shrink-0">
                    {m.installed ? (
                      <button onClick={() => remove(m.tag)} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/30">
                        Remove
                      </button>
                    ) : prog ? (
                      <span className="text-xs text-slate-500">{prog.percent}%</span>
                    ) : (
                      <button onClick={() => pull(m.tag)} disabled={!m.fits} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-40">
                        Download
                      </button>
                    )}
                  </div>
                </div>

                {prog && (
                  <div className="mt-3">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className="h-full bg-accent transition-all" style={{ width: `${prog.percent}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{prog.status}</p>
                  </div>
                )}

                {pullErrors[m.tag] && (
                  <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-300">{pullErrors[m.tag]}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
