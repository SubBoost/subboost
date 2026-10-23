import { describe, expect, it } from "vitest";

import { buildApiErrorBody, readJsonBody } from "./http";

describe("server-core http helpers", () => {
  it("builds stable API error bodies", () => {
    expect(buildApiErrorBody("Invalid request", "BAD_REQUEST")).toEqual({
      error: "Invalid request",
      code: "BAD_REQUEST",
    });
  });

  it("handles absent, empty and invalid-length bodies without trusting Content-Length", async () => {
    const url = "http://local.subboost.test";
    expect(await readJsonBody(new Request(url), 10)).toEqual({ ok: true, value: {} });
    expect(await readJsonBody(new Request(url, { method: "POST", body: "  " }), 10)).toEqual({ ok: true, value: {} });
    expect(await readJsonBody(new Request(url, { method: "POST", headers: { "Content-Length": "bad" }, body: "{}" }), 10))
      .toEqual({ ok: true, value: {} });
    expect(await readJsonBody(new Request(url, { headers: { "Content-Length": "11" } }), 10))
      .toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects invalid UTF-8 and stream failures while releasing the reader", async () => {
    for (const stream of [
      new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([0xff])); controller.close(); } }),
      new ReadableStream({ start(controller) { controller.error(new Error("read failed")); } }),
    ]) {
      const request = { headers: new Headers(), body: stream } as Request;
      expect(await readJsonBody(request, 100)).toEqual({ ok: false, reason: "invalid_json" });
      expect(stream.locked).toBe(false);
    }
  });

  it("keeps the size failure when stream cancellation rejects", async () => {
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(3)); },
      cancel() { return Promise.reject(new Error("cancel failed")); },
    });
    expect(await readJsonBody({ headers: new Headers(), body: stream } as Request, 2))
      .toEqual({ ok: false, reason: "too_large" });
    expect(stream.locked).toBe(false);
  });
});
