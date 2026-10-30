import { LOCAL_JSON_BODY_LIMITS, readJsonBody, type ReadJsonBodyResult } from "./http";

type LoginBodyResult =
  | { kind: "parsed"; result: ReadJsonBodyResult }
  | { kind: "limited" }
  | { kind: "timeout" }
  | { kind: "aborted" };

const MAX_ACTIVE = 8;
const BODY_DEADLINE_MS = 10_000;
const BODY_RATE_PER_SECOND = 64;
const MAX_DISCARDING = 8;
let active = 0;
let discarding = 0;
let tokens = BODY_RATE_PER_SECOND;
let lastRefillAt = performance.now();

function discard(body: ReadableStream<Uint8Array> | null): void {
  if (!body || discarding >= MAX_DISCARDING) return;
  discarding += 1;
  try {
    void body.cancel().catch(() => {}).finally(() => { discarding -= 1; });
  } catch {
    discarding -= 1;
  }
}

function acquire(): boolean {
  const now = performance.now();
  tokens = Math.min(BODY_RATE_PER_SECOND, tokens + Math.max(0, now - lastRefillAt) * BODY_RATE_PER_SECOND / 1000);
  lastRefillAt = now;
  if (active >= MAX_ACTIVE || tokens < 1) return false;
  tokens -= 1;
  active += 1;
  return true;
}

export async function readLoginBody(request: Request): Promise<LoginBodyResult> {
  if (request.signal.aborted) {
    discard(request.body);
    return { kind: "aborted" };
  }
  if (!acquire()) {
    discard(request.body);
    return { kind: "limited" };
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > LOCAL_JSON_BODY_LIMITS.small) {
    try {
      if (request.body) void request.body.cancel().catch(() => {}).finally(() => { active -= 1; });
      else active -= 1;
    } catch { active -= 1; }
    return { kind: "parsed", result: { ok: false, reason: "too_large" } };
  }
  if (!request.body) {
    try { return { kind: "parsed", result: await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small) }; }
    finally { active -= 1; }
  }

  const controller = new AbortController();
  let stop!: (result: LoginBodyResult) => void;
  const interrupted = new Promise<LoginBodyResult>((resolve) => { stop = resolve; });
  const interrupt = (kind: "timeout" | "aborted") => { stop({ kind }); controller.abort(); };
  const onAbort = () => interrupt("aborted");
  const timer = setTimeout(() => interrupt("timeout"), BODY_DEADLINE_MS);
  request.signal.addEventListener("abort", onAbort, { once: true });
  let workStarted = false;
  try {
    const stream = new TransformStream<Uint8Array, Uint8Array>();
    const guarded = new Request(request.url, {
      method: "POST", headers: request.headers, body: stream.readable, duplex: "half",
    } as RequestInit & { duplex: "half" });
    const pipe = request.body.pipeTo(stream.writable, { signal: controller.signal })
      .catch(async () => { await stream.writable.abort().catch(() => {}); });
    const work = readJsonBody(guarded, LOCAL_JSON_BODY_LIMITS.small)
      .then((result): LoginBodyResult => ({ kind: "parsed", result }))
      .finally(async () => {
        controller.abort();
        await pipe;
        active -= 1;
      });
    workStarted = true;
    return await Promise.race([work, interrupted]);
  } catch {
    if (!workStarted) {
      active -= 1;
      discard(request.body);
    }
    return { kind: "parsed", result: { ok: false, reason: "invalid_json" } };
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", onAbort);
  }
}

export function clearLoginBodyLimitForTests(): void {
  if (process.env.NODE_ENV !== "test") return;
  tokens = BODY_RATE_PER_SECOND;
  lastRefillAt = performance.now();
}
