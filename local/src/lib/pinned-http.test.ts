import { createServer, type Server } from "node:http";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestPinnedText, ResponseTooLargeError } from "./pinned-http";

describe("pinned local HTTP transport", () => {
  let server: Server;
  let port = 0;
  let observedHost = "";

  beforeAll(async () => {
    server = createServer((request, response) => {
      observedHost = request.headers.host || "";
      const body = request.url === "/large" ? "x".repeat(2048) : "ss://node";
      response.writeHead(200, {
        "Content-Type": "text/plain",
        "Content-Encoding": "gzip",
      });
      response.end(gzipSync(body));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP test server address");
    port = address.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it("connects only to the validated address while preserving the original Host header", async () => {
    const response = await requestPinnedText({
      url: `http://example.test:${port}/ok`,
      addresses: ["127.0.0.1"],
      method: "GET",
      userAgent: "SubBoost Test",
      maxBytes: 1024,
      signal: new AbortController().signal,
    });

    expect(response).toMatchObject({ status: 200, content: "ss://node" });
    expect(observedHost).toBe(`example.test:${port}`);
  });

  it("enforces the limit after response decompression", async () => {
    await expect(requestPinnedText({
      url: `http://example.test:${port}/large`,
      addresses: ["127.0.0.1"],
      method: "GET",
      userAgent: "SubBoost Test",
      maxBytes: 128,
      signal: new AbortController().signal,
    })).rejects.toBeInstanceOf(ResponseTooLargeError);
  });
});
