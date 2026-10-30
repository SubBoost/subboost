type Release = () => void;
type Waiter = {
  signal: AbortSignal;
  resolve: (release: Release | null) => void;
  cancel: () => void;
  timeout?: ReturnType<typeof setTimeout>;
};

// Unknown clients share a small FIFO instead of a reusable global lockout bucket.
const MAX_ACTIVE = 2;
const MAX_WAITING = 2;
const START_INTERVAL_MS = 10_000;
const WAIT_TIMEOUT_MS = 25_000;
const waiting: Waiter[] = [];
let active = 0;
let nextStartAt = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

function pump(): void {
  if (waiting.length === 0 || active >= MAX_ACTIVE) return;
  const delay = Math.max(0, nextStartAt - performance.now());
  if (delay > 0) {
    timer ??= setTimeout(() => { timer = undefined; pump(); }, delay);
    return;
  }
  const waiter = waiting.shift()!;
  waiter.signal.removeEventListener("abort", waiter.cancel);
  clearTimeout(waiter.timeout);
  if (waiter.signal.aborted) {
    waiter.resolve(null);
    pump();
    return;
  }
  active += 1;
  nextStartAt = performance.now() + START_INTERVAL_MS;
  let released = false;
  waiter.resolve(() => {
    if (released) return;
    released = true;
    active -= 1;
    pump();
  });
  pump();
}

export function enterUnknownLoginQueue(signal: AbortSignal): Promise<Release | null> {
  if (signal.aborted || waiting.length >= MAX_WAITING) return Promise.resolve(null);
  return new Promise((resolve) => {
    const waiter: Waiter = {
      signal,
      resolve,
      cancel: () => {
        const index = waiting.indexOf(waiter);
        if (index < 0) return;
        waiting.splice(index, 1);
        signal.removeEventListener("abort", waiter.cancel);
        clearTimeout(waiter.timeout);
        if (waiting.length === 0 && timer) { clearTimeout(timer); timer = undefined; }
        resolve(null);
      },
    };
    waiter.timeout = setTimeout(waiter.cancel, WAIT_TIMEOUT_MS);
    signal.addEventListener("abort", waiter.cancel, { once: true });
    waiting.push(waiter);
    pump();
  });
}

export function clearUnknownLoginQueueForTests(): void {
  if (process.env.NODE_ENV !== "test") return;
  while (waiting.length) waiting[0].cancel();
  if (timer) clearTimeout(timer);
  timer = undefined;
  nextStartAt = 0;
}
