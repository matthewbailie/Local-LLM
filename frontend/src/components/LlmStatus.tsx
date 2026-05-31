import { useState } from "react";
import { useOnEscape } from "../lib/useOnEscape";
import { useDismissAnimation } from "../lib/useDismissAnimation";

interface Props {
  loaded: boolean;
  busy: boolean;
  loading: boolean;
  onToggle: () => void;
}

export default function LlmStatus({ loaded, busy, loading, onToggle }: Props) {
  const [showInfo, setShowInfo] = useState(false);
  const { closing, dismiss, reset } = useDismissAnimation();
  const closeInfo = () => dismiss(() => setShowInfo(false));
  const openInfo = () => {
    reset();
    setShowInfo(true);
  };
  useOnEscape(closeInfo);

  const label = loading ? "Starting…" : loaded ? "LLM on" : "LLM off";
  const trackColor = loading
    ? "bg-amber-400 dark:bg-amber-500"
    : loaded
    ? "bg-green-500 dark:bg-green-500"
    : "bg-slate-300 dark:bg-slate-600";
  const knobX = loading ? "translate-x-[0.875rem]" : loaded ? "translate-x-[1.375rem]" : "translate-x-0.5";
  const tooltip = loading ? "Loading the model into memory…" : loaded ? "On - click to unload and free RAM" : "Off - click to load the model into memory";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={loaded}
        aria-label={`LLM is ${label}. ${tooltip}`}
        onClick={onToggle}
        disabled={busy || loading}
        title={tooltip}
        className="group inline-flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-accent disabled:cursor-not-allowed"
      >
        <span className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors ${trackColor} ${busy || loading ? "opacity-80" : ""}`}>
          <span className={`flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm transition-transform ${knobX}`}>
            {loading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />}
          </span>
        </span>
        <span className={`text-xs font-medium ${loaded ? "text-green-700 dark:text-green-300" : loading ? "text-amber-700 dark:text-amber-300" : "text-slate-500 dark:text-slate-400"}`}>{label}</span>
      </button>

      <button
        onClick={openInfo}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs text-slate-500 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-accent dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label="About the LLM on/off control"
      >
        i
      </button>

      {showInfo && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 ${closing ? "anim-fade-out" : "anim-fade-in"}`} onClick={closeInfo}>
          <div role="dialog" aria-modal="true" aria-label="About the LLM on/off toggle" className={`relative w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900 ${closing ? "anim-panel-out" : "anim-panel-in"}`} onClick={(e) => e.stopPropagation()}>
            <button onClick={closeInfo} className="absolute right-3 top-3 rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
              ✕
            </button>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">The LLM on/off toggle</h3>
            <div className="mt-2 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <p>
                <strong>On:</strong> the model is loaded in your computer's memory (RAM) and ready to reply instantly.
              </p>
              <p>
                <strong>Off:</strong> the model is unloaded to give that RAM back to your other apps. Flip it off to unload, on to load it back. While it loads you'll see a spinner and <strong>Starting…</strong>.
              </p>
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                <strong>Tip:</strong> if your computer feels slow, turn the LLM off to free up memory.
              </p>
              <p>Turning it off does not uninstall the model. It stays on disk and reloads automatically the next time you send a message or start a new chat, so that first reply may take a few extra seconds.</p>
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={closeInfo} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
