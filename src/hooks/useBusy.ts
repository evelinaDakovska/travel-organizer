import { useCallback, useRef, useState } from 'react';

/**
 * One action at a time, for a button that writes and then leaves: a second tap while the first is
 * still running does nothing, so a save never runs twice and `router.back()` never pops two
 * screens. `busy` is for the button's spinner; the ref is what guards, since state lands a render
 * late. A failure still rejects, for the caller to report.
 */
export function useBusy(): [busy: boolean, run: (action: () => Promise<void>) => Promise<void>] {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, run];
}
