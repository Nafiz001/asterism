import { useSyncExternalStore } from "react";

// The current time, as a value React can render from: it changes once a
// minute, the same for every screen, rather than being read during render.

let now = new Date();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    timer = setInterval(() => {
      now = new Date();
      listeners.forEach((l) => l());
    }, 60_000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useMinute(): Date {
  return useSyncExternalStore(subscribe, () => now, () => now);
}
