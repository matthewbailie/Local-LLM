import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { CatalogModel } from "../types";

type Mode = "no-ollama" | "no-model";

interface Props {
  mode: Mode;
  reservedRamGb: number;
  // Re-run the readiness check (parent flips the mode away when satisfied).
  onRecheck: () => void;
  // Called after a model finishes downloading, with its tag.
  onInstalled: (tag: string) => void;
  // Dismiss onboarding and open the full model library.
  onOpenLibrary: () => void;
  // Dismiss onboarding without doing anything (power users / false negatives).
  onSkip: () => void;
}

const OLLAMA_DOWNLOAD_URL = "https://ollama.com/download";

// Pick a sensible first model: the best tool-capable model that fits the user's
// RAM budget, capped around 8 GB so the first download stays reasonable. Falls
// back to the smallest fitting model when the budget is very small, or to any
// fitting model if none are tool-capable.
function pickStarter(models: CatalogModel[]): CatalogModel | null {
  const toolCapable = models.filter((m) => m.toolCalling && m.fits && !m.installed);
  const pool = toolCapable.length ? toolCapable : models.filter((m) => m.fits && !m.installed);
  if (!pool.length) return null;
  const sweetSpot = pool.filter((m) => m.ramGb <= 8).sort((a, b) => b.ramGb - a.ramGb);
  if (sweetSpot.length) return sweetSpot[0];
  return [...pool].sort((a, b) => a.ramGb - b.ramGb)[0];
}

export default function Onboarding({ mode, reservedRamGb, onRecheck, onInstalled, onOpenLibrary, onSkip }: Props) {
  const [checking, setChecking] = useState(false);

  const [loadingCatalog, setLoadingCatalog] = useState(mode === "no-model");
  const [starter, setStarter] = useState<CatalogModel | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ percent: number; status: string } | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // For the "no model" screen, find a recommended starter model.
  useEffect(() => {
    if (mode !== "no-model") return;
    let cancelled = false;
    (async () => {
      setLoadingCatalog(true);
      try {
        const data = await api.availableModels(reservedRamGb, false);
        if (cancelled) return;
        setStarter(pickStarter(data.models));
        setCatalogError(null);
      } catch (e) {
        if (!cancelled) setCatalogError(e instanceof Error ? e.message : "Could not load the model list.");
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, reservedRamGb]);

  const retry = () => {
    setChecking(true);
    onRecheck();
    // If Ollama still isn't up, the parent leaves us mounted; clear the spinner.
    window.setTimeout(() => setChecking(false), 1500);
  };

  const download = async (tag: string) => {
    setDownloadError(null);
    setProgress({ percent: 0, status: "starting" });
    let failure: string | null = null;
    try {
      const res = await fetch("/api/models/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Could not start the download.");
      }
      if (!res.body) throw new Error("No download stream.");
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
            else if (j.total && j.completed)
              setProgress({ percent: Math.round((j.completed / j.total) * 100), status: j.status ?? "downloading" });
            else if (j.status) setProgress((p) => ({ percent: p?.percent ?? 0, status: j.status }));
          } catch {
            /* ignore partial line */
          }
        }
      }
    } catch (e) {
      failure = e instanceof Error ? e.message : "Download failed.";
    }
    setProgress(null);
    if (failure) setDownloadError(failure);
    else onInstalled(tag);
  };

  return (
    <div className="anim-fade-in fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "no-ollama" ? "Install Ollama" : "Download your first model"}
        className="anim-panel-in w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <img src="/icon.svg" alt="" aria-hidden className="h-9 w-9 rounded-lg" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Welcome to Free AI Forever</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">One quick step and you're chatting.</p>
          </div>
        </div>

        {mode === "no-ollama" ? (
          <div className="px-6 py-5">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">First, install Ollama</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Free AI Forever runs AI models privately on your own computer using a free helper app called{" "}
              <strong>Ollama</strong>. You only install it once.
            </p>
            <ol className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-200">
              <li className="flex gap-2">
                <span className="font-semibold text-accent">1.</span> Download and install Ollama.
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-accent">2.</span> Open it once so it starts running (you'll see its icon in your menu bar / system tray).
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-accent">3.</span> Come back here - this screen continues on its own, or click the button below.
              </li>
            </ol>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href={OLLAMA_DOWNLOAD_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent"
              >
                Download Ollama
              </a>
              <button
                onClick={retry}
                disabled={checking}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {checking ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                    Checking…
                  </>
                ) : (
                  "I've installed it - retry"
                )}
              </button>
            </div>
            <p className="mt-4 text-xs text-slate-400">
              This screen checks for Ollama automatically every few seconds.{" "}
              <button onClick={onSkip} className="underline hover:text-slate-600 dark:hover:text-slate-300">
                Continue anyway
              </button>
            </p>
          </div>
        ) : (
          <div className="px-6 py-5">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Download your first model</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              A model is the AI "brain" that runs on your computer. This is a one-time download. We picked one that fits
              your computer's memory - you can add more later from <strong>Manage LLMs</strong>.
            </p>

            {loadingCatalog && (
              <div className="mt-5 flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                Finding a good model for your computer…
              </div>
            )}

            {!loadingCatalog && catalogError && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/30 dark:text-red-300">
                {catalogError}
              </p>
            )}

            {!loadingCatalog && !catalogError && !starter && (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                No model fits your current memory budget. Lower "RAM reserved for the LLM" in Settings, or browse all
                models to choose a smaller one.
              </p>
            )}

            {!loadingCatalog && starter && (
              <div className="mt-5 rounded-xl border border-accent/40 bg-accent/5 p-4 ring-1 ring-accent/20">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-medium text-slate-900 dark:text-slate-100">{starter.name}</h4>
                  <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-fg">RECOMMENDED</span>
                  {starter.toolCalling ? (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" title="Can search the web and fetch pages">
                      🌐 INTERNET
                    </span>
                  ) : (
                    <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                      NO INTERNET
                    </span>
                  )}
                  {starter.vision && (
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                      VISION
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{starter.description}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {starter.downloadSizeGb > 0 ? `${starter.downloadSizeGb} GB download` : "size varies"}
                  {starter.ramGb > 0 ? ` · ~${starter.ramGb} GB RAM` : ""}
                </p>

                {progress ? (
                  <div className="mt-3">
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className="h-full bg-accent transition-all" style={{ width: `${progress.percent}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {progress.percent}% · {progress.status}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => download(starter.tag)}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    Download and start
                  </button>
                )}

                {downloadError && (
                  <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-300">
                    {downloadError}
                  </p>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm">
              <button onClick={onOpenLibrary} className="text-accent underline-offset-2 hover:underline">
                See all models
              </button>
              {!progress && (
                <button onClick={onSkip} className="text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline dark:hover:text-slate-300">
                  Skip for now
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
