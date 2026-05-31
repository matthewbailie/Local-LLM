import { useCallback, useState } from "react";

// Plays a brief exit animation before a modal/popover actually unmounts.
// `closing` flips true immediately so the component can swap to its "out"
// animation; the dismiss action runs after `duration` ms. If the action
// resolves to `false` (or throws), the close is cancelled and the panel stays
// open - handy for "save on close" dialogs whose save can fail.
export function useDismissAnimation(duration = 150) {
  const [closing, setClosing] = useState(false);

  const dismiss = useCallback(
    (action: () => void | boolean | Promise<void | boolean>) => {
      setClosing(true);
      window.setTimeout(async () => {
        try {
          const ok = await action();
          if (ok === false) setClosing(false);
        } catch {
          setClosing(false);
        }
      }, duration);
    },
    [duration]
  );

  // Reset back to the open state. Needed for popovers that re-open without the
  // component unmounting (unmounting would reset this state on its own).
  const reset = useCallback(() => setClosing(false), []);

  return { closing, dismiss, reset };
}
