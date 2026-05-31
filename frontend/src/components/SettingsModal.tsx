import { useState } from "react";
import { api } from "../lib/api";
import { useOnEscape } from "../lib/useOnEscape";
import { useDismissAnimation } from "../lib/useDismissAnimation";
import type { AppConfig, ApprovalMode, Theme } from "../types";

interface Props {
  config: AppConfig;
  onClose: () => void;
  onSaved: (cfg: AppConfig) => void;
}

function Field({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">{label}</label>
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{description}</p>
      {children}
    </div>
  );
}

export default function SettingsModal({ config, onClose, onSaved }: Props) {
  const total = config.machine.totalRamGb;
  // The slider value is the LLM budget (drag right = more memory for the model).
  // Reserved-for-other-apps is the derived value sent to the API.
  const [budget, setBudget] = useState(Math.max(0, total - config.machine.reservedRamGb));
  const reserved = Math.max(0, total - budget);
  const [temperature, setTemperature] = useState(config.temperature);
  const [systemPrompt, setSystemPrompt] = useState(config.systemPrompt);
  const [workingDir, setWorkingDir] = useState(config.agentWorkingDir);
  const [webSearch, setWebSearch] = useState(config.webSearchEnabled);
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>(config.approvalMode);
  const [unloadOnClose, setUnloadOnClose] = useState(config.unloadOnClose);
  const [unloadAfterIdle, setUnloadAfterIdle] = useState(config.unloadAfterIdle);
  const [idleMinutes, setIdleMinutes] = useState(config.idleMinutes);
  const [theme, setTheme] = useState<Theme>(config.theme ?? "system");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { closing, dismiss } = useDismissAnimation();

  // Persist settings. Returns true on success so the animated close can finish,
  // false on error so the panel stays open and shows the message.
  const persist = async (): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {
        reservedRamGb: reserved,
        temperature,
        systemPrompt,
        agentWorkingDir: workingDir,
        webSearchEnabled: webSearch,
        approvalMode,
        unloadOnClose,
        unloadAfterIdle,
        idleMinutes,
        theme,
      };
      if (apiKey.trim()) patch.searchApiKey = apiKey.trim();
      const updated = await api.updateConfig(patch);
      onSaved(updated);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Save on close (X, Save button, click outside): persist, then unmount.
  const saveAndClose = () =>
    dismiss(async () => {
      const ok = await persist();
      if (ok) onClose();
      return ok;
    });
  // Cancel / Escape: close without saving.
  const cancel = () => dismiss(onClose);
  useOnEscape(cancel);

  return (
    <div className={`fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 ${closing ? "anim-fade-out" : "anim-fade-in"}`} onClick={saveAndClose}>
      <div role="dialog" aria-modal="true" aria-label="Settings" className={`flex max-h-[88vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl dark:bg-slate-900 ${closing ? "anim-panel-out" : "anim-panel-in"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Settings</h2>
          <button onClick={saveAndClose} disabled={saving} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800" aria-label="Save and close">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <Field label="Appearance" description="Choose a light or dark look, or follow your computer's system setting automatically.">
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="system">Follow system settings</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>

          <Field label="RAM reserved for the LLM" description="More memory for the LLM lets you run bigger, smarter models; reserve more for your other apps if your computer feels slow. Drag right to give the LLM more memory.">
            <input type="range" min={0} max={total} step={1} value={budget} onChange={(e) => setBudget(Number(e.target.value))} className="w-full" />
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              LLM budget: <strong>{budget} GB</strong> / reserved for other apps: <strong>{reserved} GB</strong> (of {total} GB total)
            </p>
          </Field>

          <Field label="Temperature" description="Controls how creative vs. focused the replies are. Lower is more precise and repeatable; higher is more varied and creative.">
            <input type="range" min={0} max={1} step={0.05} value={temperature} onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full" />
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{temperature.toFixed(2)}</p>
          </Field>

          <Field label="System prompt" description="Standing instructions the model follows in every message of this app (its personality and rules).">
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={4}
              className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </Field>

          <Field label="Agent working directory" description="The folder the assistant can change files in freely. It can read files anywhere on your computer; writing or deleting outside this folder needs your approval.">
            <input
              value={workingDir}
              onChange={(e) => setWorkingDir(e.target.value)}
              placeholder={config.resolvedWorkingDir ?? "(default workspace folder)"}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <p className="mt-1 text-xs text-slate-400">Currently: {config.resolvedWorkingDir}</p>
          </Field>

          <Field label="Web search" description="Lets the assistant look things up on the internet to answer with current information.">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm text-slate-700 dark:text-slate-200">{webSearch ? "On" : "Off"}</span>
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config.hasSearchApiKey ? "Provider API key set (leave blank to keep)" : "Optional provider API key (Tavily). Keyless DuckDuckGo used otherwise."}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
            <p className="mt-1 text-xs text-slate-400">Stored locally in a git-ignored file, never committed.</p>
          </Field>

          <Field label="Approval mode" description="When the assistant changes files, decide whether it asks you first or acts automatically inside its working folder.">
            <select
              value={approvalMode}
              onChange={(e) => setApprovalMode(e.target.value as ApprovalMode)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="auto-in-workdir">Auto-approve inside the working directory (deletes always ask)</option>
              <option value="ask-every-time">Ask every time</option>
            </select>
          </Field>

          <Field label="Unload LLM when app closes" description="Free up RAM by unloading the model from memory when you close the app. The model reloads automatically the next time you send a message.">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={unloadOnClose} onChange={(e) => setUnloadOnClose(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm text-slate-700 dark:text-slate-200">{unloadOnClose ? "On" : "Off"}</span>
            </label>
          </Field>

          <Field label="Unload LLM after idle" description="Automatically unload the model from memory after you have not chatted for a while, so other apps can use the RAM.">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={unloadAfterIdle} onChange={(e) => setUnloadAfterIdle(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm text-slate-700 dark:text-slate-200">{unloadAfterIdle ? "On" : "Off"}</span>
            </label>
            {unloadAfterIdle && (
              <select
                value={idleMinutes}
                onChange={(e) => setIdleMinutes(Number(e.target.value))}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value={5}>After 5 minutes idle</option>
                <option value={15}>After 15 minutes idle</option>
                <option value={30}>After 30 minutes idle</option>
                <option value={60}>After 60 minutes idle</option>
              </select>
            )}
          </Field>

          {error && <p className="mb-3 text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-700">
          <button onClick={cancel} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button onClick={saveAndClose} disabled={saving} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
