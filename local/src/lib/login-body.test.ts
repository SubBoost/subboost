import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearLoginBodyLimitForTests, readLoginBody } from "./login-body";

function streamed(cancel: () => void | Promise<void>, signal?: AbortSignal, bytes = 60_000): Request {
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(bytes)); },
    cancel,
  });
  return new Request("http://local.subboost.test/api/auth/login", {
    method: "POST", body, signal, duplex: "half",
  } as RequestInit & { duplex: "half" });
}

function ordinary(body = "{}"): Request {
  return new Request("http://local.subboost.test/api/auth/login", { method: "POST", body });
}

describe("login request body admission", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.useFakeTimers();
    clearLoginBodyLimitForTests();
  });
  afterEach(() => { clearLoginBodyLimitForTests(); vi.useRealTimers(); vi.unstubAllEnvs(); });

  it("caps concurrent slow bodies, times them out, and cancels their streams", async () => {
    const cancel = vi.fn();
    const reads = Array.from({ length: 8 }, () => readLoginBody(streamed(cancel)));
    const rejectedCancel = vi.fn();
    expect(await readLoginBody(streamed(rejectedCancel))).toEqual({ kind: "limited" });
    expect(rejectedCancel).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await Promise.all(reads)).toEqual(Array.from({ length: 8 }, () => ({ kind: "timeout" })));
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(8));
    await vi.advanceTimersByTimeAsync(0);
    expect(await readLoginBody(ordinary())).toEqual({ kind: "parsed", result: { ok: true, value: {} } });
  });

  it("cancels a disconnected stream and releases admission after cancellation", async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    const read = readLoginBody(streamed(cancel, controller.signal));
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect(await read).toEqual({ kind: "aborted" });
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(0);
    expect(await readLoginBody(ordinary())).toEqual({ kind: "parsed", result: { ok: true, value: {} } });
  });

  it("cancels a request that was already disconnected", async () => {
    const cancel = vi.fn();
    const controller = new AbortController();
    controller.abort();
    expect(await readLoginBody(streamed(cancel, controller.signal))).toEqual({ kind: "aborted" });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("fails promptly if the incoming stream is already locked", async () => {
    const request = ordinary();
    const reader = request.body!.getReader();
    const read = readLoginBody(request);
    await vi.advanceTimersByTimeAsync(0);
    expect(await read).toEqual({ kind: "parsed", result: { ok: false, reason: "invalid_json" } });
    reader.releaseLock();
  });

  it("keeps slots occupied if stream cancellation has not actually settled", async () => {
    const finish: Array<() => void> = [];
    const reads = Array.from({ length: 8 }, () => readLoginBody(streamed(() => new Promise<void>((resolve) => finish.push(resolve)))));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await Promise.all(reads)).toEqual(Array.from({ length: 8 }, () => ({ kind: "timeout" })));
    await vi.waitFor(() => expect(finish).toHaveLength(8));
    expect(await readLoginBody(ordinary())).toEqual({ kind: "limited" });
    finish.forEach((resolve) => resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(await readLoginBody(ordinary())).toEqual({ kind: "parsed", result: { ok: true, value: {} } });
  });

  it("bounds pending cancellations of rejected bodies", async () => {
    const admittedCancel = vi.fn();
    const admitted = Array.from({ length: 8 }, () => readLoginBody(streamed(admittedCancel)));
    const finish: Array<() => void> = [];
    const cancel = vi.fn(() => new Promise<void>((resolve) => finish.push(resolve)));
    for (let i = 0; i < 12; i += 1) expect(await readLoginBody(streamed(cancel))).toEqual({ kind: "limited" });
    expect(cancel).toHaveBeenCalledTimes(8);
    finish.forEach((resolve) => resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(await readLoginBody(streamed(cancel))).toEqual({ kind: "limited" });
    expect(cancel).toHaveBeenCalledTimes(9);
    finish[8]();
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await Promise.all(admitted)).every((result) => result.kind === "timeout")).toBe(true);
    await vi.waitFor(() => expect(admittedCancel).toHaveBeenCalledTimes(8));
    await vi.advanceTimersByTimeAsync(0);
  });

  it("keeps slots occupied while cancellation of declared oversized bodies is pending", async () => {
    const finish: Array<() => void> = [];
    for (let i = 0; i < 8; i += 1) {
      const request = streamed(() => new Promise<void>((resolve) => finish.push(resolve)));
      request.headers.set("content-length", "65537");
      expect(await readLoginBody(request)).toEqual({ kind: "parsed", result: { ok: false, reason: "too_large" } });
    }
    expect(finish).toHaveLength(8);
    expect(await readLoginBody(ordinary())).toEqual({ kind: "limited" });
    finish.forEach((resolve) => resolve());
    await vi.advanceTimersByTimeAsync(0);
    expect(await readLoginBody(ordinary())).toEqual({ kind: "parsed", result: { ok: true, value: {} } });
  });

  it("bounds repeated parsing and refills its independent short-window budget", async () => {
    for (let i = 0; i < 64; i += 1) {
      expect(await readLoginBody(ordinary("{"))).toEqual({ kind: "parsed", result: { ok: false, reason: "invalid_json" } });
    }
    expect(await readLoginBody(ordinary())).toEqual({ kind: "limited" });
    await vi.advanceTimersByTimeAsync(16);
    expect(await readLoginBody(ordinary())).toEqual({ kind: "parsed", result: { ok: true, value: {} } });
  });

  it("rejects oversized streamed and declared bodies with the existing result", async () => {
    const cancel = vi.fn();
    expect(await readLoginBody(streamed(cancel, undefined, 65_537))).toEqual({ kind: "parsed", result: { ok: false, reason: "too_large" } });
    expect(cancel).toHaveBeenCalledOnce();
    const declared = new Request("http://local.subboost.test/api/auth/login", {
      method: "POST", headers: { "content-length": "65537" }, body: "{}",
    });
    expect(await readLoginBody(declared)).toEqual({ kind: "parsed", result: { ok: false, reason: "too_large" } });
  });
});
