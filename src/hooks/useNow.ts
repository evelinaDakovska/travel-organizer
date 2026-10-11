import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * The current time, refreshed on an interval, so "up next" rolls forward while a screen stays open.
 * Also on returning to the app: timers stop in the background, and the moment someone reopens it
 * to find what is happening is the moment a stale clock would hide it.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(new Date());
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [intervalMs]);

  return now;
}
