import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fetchRuleText } from "./transport";

const url = "http://local.subboost.test/rule";
const getText = (fetchImpl: typeof fetch, maxBytes = 16) => fetchRuleText(fetchImpl, url, {}, maxBytes, (status) => `HTTP ${status}`);

describe("rule transport limits", () => {
  afterEach(() => vi.useRealTimers());

  it("reads small responses and rejects oversized headers and streamed bytes", async () => {
    await expect(getText(vi.fn(async () => new Response("small")) as typeof fetch)).resolves.toBe("small");
    const headerCancel = vi.fn();
    const oversizedHeader = new Response(new ReadableStream({ cancel: headerCancel }), { headers: { "content-length": "17" } });
    await expect(getText(vi.fn(async () => oversizedHeader) as typeof fetch)).rejects.toThrow("too large");
    expect(headerCancel).toHaveBeenCalledOnce();

    const streamCancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(12)); controller.enqueue(new Uint8Array(8)); },
      cancel: streamCancel,
    });
    await expect(getText(vi.fn(async () => new Response(stream)) as typeof fetch)).rejects.toThrow("too large");
    expect(streamCancel).toHaveBeenCalledOnce();
  });

  it("handles an empty response and cancels error responses", async () => {
    await expect(getText(vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch)).resolves.toBe("");
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), { status: 503 });
    await expect(getText(vi.fn(async () => response) as typeof fetch)).rejects.toThrow("HTTP 503");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("preserves size and status errors when cancelling a response rejects", async () => {
    const body = () => new ReadableStream({ cancel() { throw new Error("cancel rejected"); } });
    const oversized = new Response(body(), { headers: { "content-length": "17" } });
    await expect(getText(vi.fn(async () => oversized) as typeof fetch)).rejects.toThrow("too large");
    const unavailable = new Response(body(), { status: 503 });
    await expect(getText(vi.fn(async () => unavailable) as typeof fetch)).rejects.toThrow("HTTP 503");
    await expect(getText(vi.fn(async () => new Response("ok")) as typeof fetch)).resolves.toBe("ok");
  });

  it("keeps a timeout result if cancelling a late response rejects", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(async () => new Response(new ReadableStream({
      cancel() { throw new Error("cancel rejected"); },
    }))) as typeof fetch;
    const result = fetchRuleText(fetchImpl, url, {}, 16, String, 0);
    vi.advanceTimersByTime(0);
    await expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(0);
    await expect(getText(vi.fn(async () => new Response("ok")) as typeof fetch)).resolves.toBe("ok");
  });

  it("releases failed fetches so queued work can continue", async () => {
    const pending: Array<{ resolve: (response: Response) => void; reject: (error: Error) => void }> = [];
    const fetchImpl = vi.fn(() => {
      if (pending.length === 8) return Promise.resolve(new Response("next"));
      return new Promise<Response>((resolve, reject) => pending.push({ resolve, reject }));
    }) as typeof fetch;
    const requests = Array.from({ length: 8 }, () => getText(fetchImpl).then(
      (value) => value,
      (error: Error) => error.message,
    ));
    const queued = getText(fetchImpl);
    await vi.waitFor(() => expect(pending).toHaveLength(8));
    expect(fetchImpl).toHaveBeenCalledTimes(8);
    pending[0].reject(new Error("network failed"));
    await expect(queued).resolves.toBe("next");
    pending.slice(1).forEach(({ resolve }) => resolve(new Response("ok")));
    expect(await Promise.all(requests)).toEqual(["network failed", "ok", "ok", "ok", "ok", "ok", "ok", "ok"]);
  });

  it("releases capacity after a response stream fails", async () => {
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error("stream failed")); } });
    await expect(getText(vi.fn(async () => new Response(stream)) as typeof fetch)).rejects.toThrow("stream failed");
    await expect(getText(vi.fn(async () => new Response("ok")) as typeof fetch)).resolves.toBe("ok");
  });

  it("cancels a response when the deadline expires before fetch starts", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(true);
      return new Response(new ReadableStream({ cancel }));
    }) as typeof fetch;
    const result = fetchRuleText(fetchImpl, url, {}, 16, String, 0);
    vi.advanceTimersByTime(0);
    await expect(result).rejects.toThrow("timed out");
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });


  it("bounds active and queued work and cancels stalled streams on deadline", async () => {
    vi.useFakeTimers();
    let active = 0;
    let peak = 0;
    let cancelled = 0;
    const fetchImpl = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      return new Response(new ReadableStream({ cancel() { active -= 1; cancelled += 1; } }));
    }) as typeof fetch;
    const requests = Array.from({ length: 73 }, () => getText(fetchImpl).then(
      () => "ok",
      (error: Error) => error.message,
    ));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(8));
    expect(await requests[72]).toContain("capacity");
    await vi.advanceTimersByTimeAsync(15_000);
    const results = await Promise.all(requests);
    expect(results.slice(0, 72).every((result) => result.includes("timed out"))).toBe(true);
    expect(peak).toBeLessThanOrEqual(8);
    expect(cancelled).toBeGreaterThanOrEqual(8);
    expect(active).toBe(0);
  });

  it("aborts a real stalled HTTP response and closes its connection", async () => {
    let closed!: () => void;
    const connectionClosed = new Promise<void>((resolve) => { closed = resolve; });
    const server = createServer((_request, response) => {
      response.on("close", closed);
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.write("partial");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as AddressInfo).port;
      await expect(fetchRuleText(fetch, `http://127.0.0.1:${port}/`, {}, 1024, String, 100))
        .rejects.toThrow("timed out");
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([connectionClosed, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("connection stayed open")), 2000); })]);
      } finally {
        clearTimeout(timeout);
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("does not free slots for fetch implementations that ignore abort until they settle", async () => {
    vi.useFakeTimers();
    const release: Array<(response: Response) => void> = [];
    const stalledFetch = vi.fn(() => new Promise<Response>((resolve) => release.push(resolve))) as typeof fetch;
    const stalled = Array.from({ length: 8 }, () => fetchRuleText(stalledFetch, url, {}, 16, String, 100).catch((error: Error) => error.message));
    await vi.waitFor(() => expect(release).toHaveLength(8));
    await vi.advanceTimersByTimeAsync(100);
    expect((await Promise.all(stalled)).every((value) => value.includes("timed out"))).toBe(true);
    const nextFetch = vi.fn(async () => new Response("ok")) as typeof fetch;
    const next = fetchRuleText(nextFetch, url, {}, 16, String, 100).catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(100);
    expect(await next).toContain("timed out");
    expect(nextFetch).not.toHaveBeenCalled();
    release.forEach((resolve) => resolve(new Response("late")));
    await vi.waitFor(() => expect(release).toHaveLength(8));
    await Promise.resolve();
    await Promise.resolve();
    await expect(fetchRuleText(nextFetch, url, {}, 16, String, 100)).resolves.toBe("ok");
  });

  it("keeps slots occupied until oversized stream cancellation completes", async () => {
    vi.useFakeTimers();
    const finishCancellation: Array<() => void> = [];
    const fetchImpl = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(17)); },
      cancel() { return new Promise<void>((resolve) => finishCancellation.push(resolve)); },
    }))) as typeof fetch;
    const requests = Array.from({ length: 8 }, () => fetchRuleText(fetchImpl, url, {}, 16, String, 100).catch((error: Error) => error.message));
    await vi.waitFor(() => expect(finishCancellation).toHaveLength(8));
    await vi.advanceTimersByTimeAsync(100);
    expect((await Promise.all(requests)).every((value) => value.includes("timed out"))).toBe(true);
    const nextFetch = vi.fn(async () => new Response("ok")) as typeof fetch;
    const queued = fetchRuleText(nextFetch, url, {}, 16, String, 100).catch((error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(100);
    expect(await queued).toContain("timed out");
    expect(nextFetch).not.toHaveBeenCalled();
    finishCancellation.forEach((finish) => finish());
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await expect(fetchRuleText(nextFetch, url, {}, 16, String, 100)).resolves.toBe("ok");
  });
});
