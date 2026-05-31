import type { ApprovalAction } from "../types";

const VERB: Record<string, string> = {
  write: "write a file",
  mkdir: "create a folder",
  delete: "delete",
};

export default function ApprovalCard({ action, onApprove, onDeny }: { action: ApprovalAction; onApprove: () => void; onDeny: () => void }) {
  const isDestructive = action.action === "delete";
  // Primary action: red for destructive (delete), accent otherwise.
  const approveClass = isDestructive
    ? "rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400"
    : "rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent";
  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700/60 dark:bg-amber-900/20">
      <div className="flex items-center gap-2">
        <span className="text-lg">⚠️</span>
        <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">Approval needed</h3>
      </div>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
        The assistant wants to <strong>{VERB[action.action] ?? action.action}</strong>:
      </p>
      <code className="mt-1 block break-all rounded bg-amber-100 px-2 py-1 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">{action.path}</code>

      {action.action === "write" && action.content != null && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-amber-700 dark:text-amber-300">Preview content</summary>
          <pre className="mt-1 max-h-60 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">{action.content}</pre>
        </details>
      )}

      <div className="mt-3 flex gap-2">
        <button onClick={onApprove} className={approveClass}>
          {isDestructive ? "Delete" : "Approve"}
        </button>
        <button onClick={onDeny} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-accent dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
          Deny
        </button>
      </div>
    </div>
  );
}
