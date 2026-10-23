import { describe, expect, it, vi } from "vitest";
import { handleRuleDetection } from "./detect";
const request = (body: string) => new Request("http://local.subboost.test/api/rules/detect", { method: "POST", body });

describe("rule detection request boundary", () => {
  it("returns only metadata using content instead of a misleading extension", async () => {
    const url = "https://local.subboost.test/domains.txt?key=fixture";
    const fetchContent = vi.fn().mockResolvedValue("payload: ['+.example.test']");
    const response = await handleRuleDetection(request(JSON.stringify({ url })), fetchContent);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ path: url, name: "domains", format: "yaml", behavior: "domain" });
    expect(fetchContent).toHaveBeenCalledWith(url);
  });
  it.each(["file:///etc/passwd", "https://user:pass@local.subboost.test/rules", "not-url"])("rejects URL %s before transport", async (url) => {
    const fetchContent = vi.fn();
    expect((await handleRuleDetection(request(JSON.stringify({ url })), fetchContent)).status).toBe(400);
    expect(fetchContent).not.toHaveBeenCalled();
  });
  it("rejects oversized bodies without Content-Length and invalid JSON", async () => {
    const fetchContent = vi.fn();
    expect((await handleRuleDetection(request("x".repeat(65537)), fetchContent)).status).toBe(413);
    expect((await handleRuleDetection(request("{"), fetchContent)).status).toBe(400);
    expect(fetchContent).not.toHaveBeenCalled();
  });
  it("does not expose fetch errors or import malformed content", async () => {
    const body = JSON.stringify({ url: "https://local.subboost.test/rules" });
    const fetchContent = vi.fn().mockRejectedValue(new Error("secret upstream details"));
    const response = await handleRuleDetection(request(body), fetchContent);
    expect(response.status).toBe(422);
    expect(await response.text()).not.toContain("secret");
    const invalid = await handleRuleDetection(request(body), async () => "<html>error</html>");
    expect(invalid.status).toBe(422);
  });
  it.each([null, 1, "url", [], {}, { url: 1 }])("rejects malformed JSON inputs before transport: %j", async (value) => {
    const fetchContent = vi.fn();
    const response = await handleRuleDetection(request(JSON.stringify(value)), fetchContent);
    expect(response.status).toBe(400);
    expect(fetchContent).not.toHaveBeenCalled();
  });
});
