import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentAdmin } from "@local/lib/auth";
import { importSourceUrlDirect } from "@local/lib/source-import";
import * as route from "../app/api/source-import/route";

vi.mock("@local/lib/auth", () => ({
  getCurrentAdmin: vi.fn(),
}));

vi.mock("@local/lib/source-import", () => ({
  importSourceUrlDirect: vi.fn(),
}));

const admin = { id: "admin-1", username: "root" };

function jsonRequest(body: unknown): Request {
  return new Request("http://local.test/api/source-import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentAdmin).mockResolvedValue(admin);
  vi.mocked(importSourceUrlDirect).mockResolvedValue({
    ok: true,
    content: "proxies: []",
    headers: { "subscription-userinfo": "total=3" },
    parsedNodes: [{ name: "DIRECT", type: "direct", udp: true }],
    parseErrors: ["ignored invalid line"],
  });
});

describe("local source import route", () => {
  it("uses the local direct import service", async () => {
    const response = await route.POST(jsonRequest({
      url: "https://example.com/sub.yaml",
      userinfoUrl: "https://example.com/userinfo",
      userinfoUserAgent: "mihomo/1.19.24",
    }));

    expect(response.status).toBe(200);
    expect(importSourceUrlDirect).toHaveBeenCalledWith({
      url: "https://example.com/sub.yaml",
      userinfoUrl: "https://example.com/userinfo",
      userinfoUserAgent: "mihomo/1.19.24",
    });
    await expect(response.json()).resolves.toMatchObject({
      content: "proxies: []",
      headers: { "subscription-userinfo": "total=3" },
      parseResult: {
        nodes: [{ name: "DIRECT", type: "direct", udp: true }],
        errors: ["ignored invalid line"],
        totalParsed: 1,
        totalFailed: 1,
      },
    });
  });

  it("requires an authenticated local admin", async () => {
    vi.mocked(getCurrentAdmin).mockResolvedValueOnce(null);

    const response = await route.POST(jsonRequest({ url: "https://example.com/sub.yaml" }));

    expect(response.status).toBe(401);
    expect(importSourceUrlDirect).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON bodies before importing", async () => {
    const response = await route.POST(jsonRequest(null));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid JSON body.",
      code: "BAD_REQUEST",
    });
    expect(importSourceUrlDirect).not.toHaveBeenCalled();
  });

  it("rejects source import bodies above 64 KiB", async () => {
    const response = await route.POST(new Request("http://local.test/api/source-import", {
      method: "POST",
      headers: { "content-length": String(64 * 1024 + 1) },
      body: "{}",
    }));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Request body is too large.",
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("normalizes optional userinfo fields and forwards import errors", async () => {
    let response = await route.POST(jsonRequest({
      url: " https://example.com/sub.yaml ",
      userinfoUrl: " ",
      userinfoUserAgent: "",
    }));

    expect(response.status).toBe(200);
    expect(importSourceUrlDirect).toHaveBeenCalledWith({
      url: "https://example.com/sub.yaml",
      userinfoUrl: undefined,
      userinfoUserAgent: undefined,
    });

    vi.mocked(importSourceUrlDirect).mockResolvedValueOnce({
      ok: false,
      error: "bad format",
      errorInfo: { category: "format" },
      responseStatus: 422,
    } as never);
    response = await route.POST(jsonRequest({ url: "bad" }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: "bad format",
      code: "BAD_REQUEST",
      errorInfo: { category: "format" },
    });

    vi.mocked(importSourceUrlDirect).mockResolvedValueOnce({
      ok: false,
      error: "fetch failed",
      errorInfo: { category: "network" },
      responseStatus: 200,
    } as never);
    response = await route.POST(jsonRequest({ url: "https://example.com/sub.yaml" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "fetch failed",
      code: "INTERNAL_ERROR",
    });
  });
});
