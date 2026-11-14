import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearUnknownLoginQueueForTests, enterUnknownLoginQueue } from "./login-queue";

describe("unknown-client login queue", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.useFakeTimers();
    clearUnknownLoginQueueForTests();
  });
  afterEach(() => {
    clearUnknownLoginQueueForTests();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("admits queued requests in FIFO order and limits verification starts", async () => {
    const order: number[] = [];
    const first = await enterUnknownLoginQueue(new AbortController().signal);
    expect(first).toBeTypeOf("function");
    first!();
    const second = enterUnknownLoginQueue(new AbortController().signal).then((release) => { order.push(2); return release; });
    const third = enterUnknownLoginQueue(new AbortController().signal).then((release) => { order.push(3); return release; });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(order).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(order).toEqual([2]);
    (await second)!();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(order).toEqual([2, 3]);
    (await third)!();
  });

  it("caps active work and waiting requests, and expires stalled waiters", async () => {
    const firstClient = new AbortController();
    const first = await enterUnknownLoginQueue(firstClient.signal);
    firstClient.abort();
    const secondPromise = enterUnknownLoginQueue(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(10_000);
    const second = await secondPromise;
    const third = enterUnknownLoginQueue(new AbortController().signal);
    const fourth = enterUnknownLoginQueue(new AbortController().signal);
    expect(await enterUnknownLoginQueue(new AbortController().signal)).toBeNull();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await third).toBeNull();
    expect(await fourth).toBeNull();
    first!();
    second!();
    const next = await enterUnknownLoginQueue(new AbortController().signal);
    expect(next).toBeTypeOf("function");
    next!();
  });

  it("removes a disconnected waiter without advancing or blocking the queue", async () => {
    const first = await enterUnknownLoginQueue(new AbortController().signal);
    first!();
    const disconnected = new AbortController();
    const cancelled = enterUnknownLoginQueue(disconnected.signal);
    const next = enterUnknownLoginQueue(new AbortController().signal);
    disconnected.abort();
    expect(await cancelled).toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    const release = await next;
    expect(release).toBeTypeOf("function");
    release!();
    expect(await enterUnknownLoginQueue(disconnected.signal)).toBeNull();
  });

  it("does not free additional capacity when a completed check is released twice", async () => {
    const initial = await enterUnknownLoginQueue(new AbortController().signal);
    initial!();
    initial!();
    const first = enterUnknownLoginQueue(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(10_000);
    const firstRelease = await first;
    const second = enterUnknownLoginQueue(new AbortController().signal);
    await vi.advanceTimersByTimeAsync(10_000);
    const secondRelease = await second;
    let thirdStarted = false;
    const third = enterUnknownLoginQueue(new AbortController().signal).then((release) => { thirdStarted = true; return release; });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(thirdStarted).toBe(false);
    firstRelease!();
    (await third)!();
    secondRelease!();
  });

  it("does not clear pending checks outside the test runtime", async () => {
    const first = await enterUnknownLoginQueue(new AbortController().signal);
    first!();
    let started = false;
    const pending = enterUnknownLoginQueue(new AbortController().signal).then((release) => { started = true; return release; });
    vi.stubEnv("NODE_ENV", "production");
    clearUnknownLoginQueueForTests();
    await vi.advanceTimersByTimeAsync(9_999);
    expect(started).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    (await pending)!();
    vi.stubEnv("NODE_ENV", "test");
  });

  it("clears pending checks and permits a new one in the test runtime", async () => {
    const first = await enterUnknownLoginQueue(new AbortController().signal);
    first!();
    const pending = enterUnknownLoginQueue(new AbortController().signal);
    clearUnknownLoginQueueForTests();
    expect(await pending).toBeNull();
    const next = await enterUnknownLoginQueue(new AbortController().signal);
    expect(next).toBeTypeOf("function");
    next!();
  });

});
