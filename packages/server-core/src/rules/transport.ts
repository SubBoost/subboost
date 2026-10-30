// Limits apply across catalog service instances in this process, including queued work.
const MAX_ACTIVE = 8;
const MAX_QUEUED = 64;
export const TREE_BYTES = 8 * 1024 * 1024;
export const LIST_BYTES = 2 * 1024 * 1024;
const DEADLINE_MS = 15_000;

export function checkRuleListLineCount(body: string): void {
  let count = 1;
  for (let offset = body.indexOf("\n"); offset !== -1; offset = body.indexOf("\n", offset + 1)) {
    if (++count > 100_000) throw new Error("Rule list has too many lines");
  }
}

type Waiter = { start: () => void; reject: (error: Error) => void };
let active = 0;
const queue: Waiter[] = [];

function release(): void {
  active -= 1;
  queue.shift()?.start();
}

function acquire(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error("Rule fetch timed out"));
  if (active < MAX_ACTIVE) {
    active += 1;
    return Promise.resolve();
  }
  if (queue.length >= MAX_QUEUED) return Promise.reject(new Error("Rule fetch capacity exceeded"));
  return new Promise((resolve, reject) => {
    const waiter: Waiter = {
      start: () => {
        signal.removeEventListener("abort", onAbort);
        active += 1;
        resolve();
      },
      reject,
    };
    const onAbort = () => {
      const index = queue.indexOf(waiter);
      if (index >= 0) queue.splice(index, 1);
      waiter.reject(new Error("Rule fetch timed out"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    queue.push(waiter);
  });
}

function onAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(new Error("Rule fetch timed out"));
    else signal.addEventListener("abort", () => reject(new Error("Rule fetch timed out")), { once: true });
  });
}

async function readBody(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) {
    void response.body?.cancel().catch(() => {});
    throw new Error("Rule response is too large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new Error("Rule response is too large");
      chunks.push(part.value);
    }
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
  }
  if (signal.aborted) throw new Error("Rule fetch timed out");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function fetchRuleText(
  fetchImpl: typeof fetch,
  url: string,
  headers: HeadersInit,
  maxBytes: number,
  describeError: (status: number) => string,
  deadlineMs = DEADLINE_MS,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);
  let acquired = false;
  try {
    await acquire(controller.signal);
    acquired = true;
    const work = (async () => {
      try {
        const response = await fetchImpl(url, { headers, signal: controller.signal });
        if (controller.signal.aborted) {
          void response.body?.cancel().catch(() => {});
          throw new Error("Rule fetch timed out");
        }
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          throw new Error(describeError(response.status));
        }
        return await readBody(response, maxBytes, controller.signal);
      } finally {
        release();
      }
    })();
    // A non-cooperating fetch implementation cannot free a live slot merely by timing out.
    acquired = false;
    return await Promise.race([work, onAbort(controller.signal)]);
  } finally {
    clearTimeout(timer);
    if (acquired) release();
  }
}
