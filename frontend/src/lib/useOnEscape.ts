import { useEffect } from "react";

// Dismiss an overlay when the user presses Escape. Accessibility requirement:
// every dialog/popover must be keyboard-dismissable.
export function useOnEscape(onEscape: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onEscape]);
}
