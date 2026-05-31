import { useState } from "react";
import { useOnEscape } from "../lib/useOnEscape";
import { useDismissAnimation } from "../lib/useDismissAnimation";

interface Props {
  onClose: () => void;
}

interface Section {
  title: string;
  body: string;
  steps?: string[];
  code?: string[];
  note?: string;
  link?: { label: string; url: string };
}

const SECTIONS: Section[] = [
  {
    title: "Tip the creator",
    body: "This app is free and runs entirely on your own computer. If it saved you money or you just want to say thanks, you can send a tip to the creator, Matthew Bailie, on Venmo at @Matthew-Bailie. Tips are completely optional and always appreciated.",
    link: { label: "Tip @Matthew-Bailie on Venmo", url: "https://venmo.com/u/Matthew-Bailie" },
  },
  {
    title: "Start and stop the app",
    body: "The easiest way to start is to double-click the launcher in the app's folder - you don't need to type anything. It starts the app for you and opens it in its own window. The first launch may take a minute while it sets itself up; after that it's quick.",
    steps: [
      "On a Mac, double-click \"Free AI Forever.command\". On Windows, double-click \"Free AI Forever.bat\". (On a Mac, the first time only, right-click the file and choose Open to get past the security prompt.)",
      "A small terminal window opens, the app starts, and it appears in its own window. Keep that terminal window open the whole time you use the app.",
      "To stop the app, close that terminal window (or click it and press Ctrl+C / Control + C). Your chats are saved.",
      "Prefer the terminal instead? Go into the app's folder (type cd plus a space, then drag the app's folder onto the window) and run the command below.",
    ],
    code: ["cd path/to/local-llm-chat", "npm run dev"],
    note: "If you double-click and nothing opens, make sure Node.js is installed (https://nodejs.org). If you use the terminal and see \"npm error … Could not read package.json … ENOENT\", you ran the command outside the app's folder - do the cd step into the app's folder first, then run npm run dev again.",
  },
  {
    title: "Install it for a Dock or taskbar icon",
    body: "Once the app is open in its window, you can install it so it gets its own icon and opens like any other app. You'll still start it with the launcher first (that runs the local server the app needs).",
    steps: [
      "With the app open, look in the browser window's menu for \"Install Free AI Forever\" (or an install icon in the address bar) and choose it.",
      "Confirm. The app now appears in your Dock/Launchpad (Mac) or taskbar/Start menu (Windows) with its own icon.",
      "Tip: the installed icon is a shortcut to the app - the launcher still needs to be running for it to load.",
    ],
  },
  {
    title: "Chat",
    body: "Type a message and press Enter (or click Send) - your local AI replies, streaming in word by word. While it is thinking you'll see an animated indicator, and you can press Stop to cancel a reply. Every chat is saved automatically, so you can close the app and come back later.",
  },
  {
    title: "Choose a model",
    body: "Pick which installed model to use from the dropdown directly below the chat box; its name always shows there. Models that need more RAM than your current budget are greyed out and marked \"needs more RAM\" - free up RAM in Settings or choose a smaller model.",
  },
  {
    title: "Queue follow-up messages",
    body: "You don't have to wait for a reply to finish. Keep typing and press Enter (the button shows \"Queue\" while the model is busy) to line up more messages - they send automatically, one at a time, in the order you added them. Queued messages appear above the input with a count, and you can remove any of them before they run. Pressing Stop cancels the current reply and clears the queue.",
  },
  {
    title: "Copy, revert, or fork a message",
    body: "Hover over any message to reveal small icons on the right, just below it. Copy puts that message's text on your clipboard. Revert returns the chat to that point and deletes everything after it (it asks you to confirm first). Fork starts a brand-new chat that keeps all the history up to that message, leaving the original chat untouched.",
  },
  {
    title: "Manage chat history",
    body: "Start a new conversation with the New chat button. Open a chat's menu with the three-dots (⋮) button that appears when you hover over it, or by right-clicking it - then pin, rename, fork (copy the whole chat into a new one), or delete. Pinned chats stay at the top, and everything is stored on your computer and survives a restart.",
  },
  {
    title: "Search your chats",
    body: "Use the search box at the top of the sidebar to find a conversation. It matches both chat titles and the text inside messages, and shows a short snippet of where the match was found.",
  },
  {
    title: "Manage LLMs",
    body: "Open this panel to browse models you can download. Each card shows its size, how much RAM it needs, whether it fits your computer, and whether it can reach the internet (\"🌐 Internet\") or only answers from what it already knows (\"No internet\"). Use the Model type dropdown to filter by family, and the Refresh button to check the internet for newly released models. Only models that can actually run on your computer are listed. Click Download to install one, or Remove to delete an installed model and free up disk space.",
  },
  {
    title: "Turn the LLM on/off",
    body: "The toggle in the top bar loads the model into memory (On) so replies are instant, or unloads it (Off) to free up RAM for your other apps. While it loads you'll see a spinner and \"Starting…\". It reloads automatically the next time you send a message, so the first reply after that may take a few extra seconds. If your computer feels slow, switch it Off.",
  },
  {
    title: "Use files and images",
    body: "Drag and drop or attach files to a message. The model reads text files as context, and vision-capable models can also understand images you attach or paste.",
  },
  {
    title: "Search the web",
    body: "When web search is turned on in Settings, the assistant can look things up online to answer with current information, and it shows the source links it used. This needs a tool-capable model (marked \"🌐 Internet\" in the library) and a working internet connection.",
  },
  {
    title: "Work with files on your computer",
    body: "The assistant can read files anywhere on your hard drive (except protected system folders) and write files directly to it. Changes inside its working folder happen automatically; writing or deleting anything outside that folder pauses for your approval first. You set the working folder and the approval mode in Settings.",
  },
  {
    title: "Switch light or dark mode",
    body: "In Settings, set Appearance to Light, Dark, or Follow system. Follow system (the default) automatically matches your computer's light or dark setting.",
  },
  {
    title: "Adjust settings",
    body: "Open Settings to change the RAM budget for the model, the response temperature, the system prompt, the working folder, web search on/off, the approval mode for file changes, the appearance theme, and when the model unloads to free RAM. Your changes save when you click Save, close the panel with the X, or click outside it.",
  },
];

function CopyableCommand({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
      <code className="flex-1 select-all font-mono text-sm text-slate-800 dark:text-slate-100">{code}</code>
      <button
        onClick={copy}
        aria-label={`Copy command: ${code}`}
        className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-accent dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export default function InstructionsModal({ onClose }: Props) {
  const { closing, dismiss } = useDismissAnimation();
  const close = () => dismiss(onClose);
  useOnEscape(close);
  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 ${closing ? "anim-fade-out" : "anim-fade-in"}`} onClick={close}>
      <div role="dialog" aria-modal="true" aria-label="How to" className={`relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl dark:bg-slate-900 ${closing ? "anim-panel-out" : "anim-panel-in"}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">How to</h2>
          <button onClick={close} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-accent dark:hover:bg-slate-800" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="space-y-5 overflow-y-auto p-5">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{s.body}</p>
              {s.steps && (
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                  {s.steps.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              )}
              {s.code && (
                <div className="mt-2 space-y-2">
                  {s.code.map((c, i) => (
                    <CopyableCommand key={i} code={c} />
                  ))}
                </div>
              )}
              {s.note && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                  {s.note}
                </p>
              )}
              {s.link && (
                <a
                  href={s.link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[#008CFF] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#0074d4] focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {s.link.label}
                </a>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t border-slate-200 p-4 dark:border-slate-700">
          <button onClick={close} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-accent">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
