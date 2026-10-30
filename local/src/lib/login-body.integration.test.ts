import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLoginBodyLimitForTests, readLoginBody } from "./login-body";

async function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("timed out")), timeoutMs); })]);
  } finally {
    clearTimeout(timeout);
  }
}

describe("login body network cancellation", () => {
  afterEach(() => { clearLoginBodyLimitForTests(); vi.unstubAllEnvs(); });

  it("closes a real connection that never finishes its request body", async () => {
    vi.stubEnv("NODE_ENV", "test");
    clearLoginBodyLimitForTests();
    let complete!: (kind: string) => void;
    let close!: () => void;
    const completed = new Promise<string>((resolve) => { complete = resolve; });
    const closed = new Promise<void>((resolve) => { close = resolve; });
    const server = createServer((incoming) => {
      incoming.on("close", close);
      const request = new Request("http://127.0.0.1/login", {
        method: "POST", body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>, duplex: "half",
      } as RequestInit & { duplex: "half" });
      void readLoginBody(request).then((result) => complete(result.kind));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const client = httpRequest({ host: "127.0.0.1", port: (server.address() as AddressInfo).port, method: "POST", path: "/" });
    client.on("error", () => {});
    const start = performance.now();
    client.write("a".repeat(60_000));
    try {
      expect(await completed).toBe("timeout");
      expect(performance.now() - start).toBeGreaterThanOrEqual(9_000);
      await within(closed, 2000);
    } finally {
      client.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30_000);

  it("closes a rejected real connection when all body readers are occupied", async () => {
    vi.stubEnv("NODE_ENV", "test");
    clearLoginBodyLimitForTests();
    let count = 0;
    let ready!: () => void;
    let rejected!: (kind: string) => void;
    let close!: () => void;
    const allReady = new Promise<void>((resolve) => { ready = resolve; });
    const rejectedResult = new Promise<string>((resolve) => { rejected = resolve; });
    const rejectedClosed = new Promise<void>((resolve) => { close = resolve; });
    const accepted: Array<Promise<unknown>> = [];
    const server = createServer((incoming, response) => {
      count += 1;
      const current = count;
      if (current === 9) incoming.on("close", close);
      const request = new Request("http://127.0.0.1/login", {
        method: "POST", body: Readable.toWeb(incoming) as ReadableStream<Uint8Array>, duplex: "half",
      } as RequestInit & { duplex: "half" });
      const result = readLoginBody(request);
      if (current <= 8) {
        accepted.push(result);
        if (current === 8) ready();
      } else {
        void result.then((value) => {
          rejected(value.kind);
          if (!response.destroyed) { response.statusCode = 429; response.end(); }
        });
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const clients = [];
    const port = (server.address() as AddressInfo).port;
    function slowClient() {
      const client = httpRequest({ host: "127.0.0.1", port, method: "POST", path: "/" });
      client.on("error", () => {});
      client.write("a".repeat(60_000));
      return client;
    }
    try {
      for (let index = 0; index < 8; index += 1) clients.push(slowClient());
      await within(allReady, 2000);
      clients.push(slowClient());
      expect(await within(rejectedResult, 2000)).toBe("limited");
      await within(rejectedClosed, 2000);
    } finally {
      clients.forEach((client) => client.destroy());
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await within(Promise.all(accepted), 2000);
    }
  }, 15_000);
});
