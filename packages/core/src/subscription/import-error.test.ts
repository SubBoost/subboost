import { describe, expect, it } from "vitest";
import {
  SubscriptionImportError,
  createSubscriptionImportErrorInfo,
  extractHttpStatus,
  getSubscriptionImportErrorBadgeText,
  getSubscriptionImportErrorCategoryLabel,
  inferSubscriptionImportErrorCategory,
  isSubscriptionImportError,
  maskUrlForPublicDisplay,
  normalizeSubscriptionImportErrorInfo,
  sanitizePublicErrorText,
} from "./import-error";

describe("extractHttpStatus", () => {
  it("only extracts explicit HTTP error status context", () => {
    expect(extractHttpStatus("upstream HTTP 503 then 404")).toBe(503);
    expect(extractHttpStatus("request failed with status code 429")).toBe(429);
    expect(extractHttpStatus("upstream returned 502")).toBe(502);
    expect(extractHttpStatus("成功解析 502 个节点")).toBeNull();
    expect(extractHttpStatus("HTTP 200")).toBeNull();
  });
});

describe("sanitizePublicErrorText", () => {
  it("does not mistake protocol URIs for Windows file paths", () => {
    const protocols = [
      "vmess://not-json",
      "vless://uuid@example.com:443?security=tls#name",
      "ss://YWVzLTEyOC1nY206cGFzcw@example.com:443#name",
      "ssr://example",
      "trojan://password@example.com:443#name",
      "tuic://uuid:password@example.com:443#name",
      "http://example.com/sub",
      "https://example.com/sub",
    ];

    for (const protocol of protocols) {
      const text = `解析失败: ${protocol} - reason`;
      expect(sanitizePublicErrorText(text)).toContain(protocol);
      expect(sanitizePublicErrorText(text)).not.toContain("[path]");
    }
  });

  it("still masks sensitive tokens and local paths", () => {
    expect(sanitizePublicErrorText("token=abc key=def password=ghi secret=jkl auth=mno")).toBe(
      "token=*** key=*** password=*** secret=*** auth=***"
    );
    expect(sanitizePublicErrorText(null)).toBe("");
    expect(sanitizePublicErrorText(undefined)).toBe("");
    expect(
      sanitizePublicErrorText(
        "fetch 192.168.1.10:8080 [fd00::1]:443 abcdef0123456789abcdef0123456789 /var/lib/private.txt"
      )
    ).toBe("fetch [IP] [IPv6] [hash] [path]");
    expect(sanitizePublicErrorText("failed at C:/Private/project/secret.txt")).toBe("failed at [path]");
    expect(sanitizePublicErrorText("failed at C:\\Private\\project\\secret.txt")).toBe("failed at [path]");
    expect(sanitizePublicErrorText("failed at /home/private/project/secret.txt")).toBe("failed at [path]");
  });

  it("masks public URLs without leaking query or path values", () => {
    expect(maskUrlForPublicDisplay("https://example.com/sub/path?token=secret")).toBe("https://example.com/***?***");
    expect(maskUrlForPublicDisplay("https://example.com/")).toBe("https://example.com");
    expect(maskUrlForPublicDisplay("https://example.com?key=secret")).toBe("https://example.com?***");
    expect(maskUrlForPublicDisplay("not a url value that should be truncated")).toBe("not a url value that should be...");
  });
});

describe("subscription import error info", () => {
  it("infers categories and default suggestions", () => {
    expect(inferSubscriptionImportErrorCategory("YAML parse failed")).toBe("parse");
    expect(inferSubscriptionImportErrorCategory("只支持 HTTP URL")).toBe("format");
    expect(inferSubscriptionImportErrorCategory("禁止访问内网地址")).toBe("security");
    expect(inferSubscriptionImportErrorCategory("ECONNRESET")).toBe("network");

    expect(
      createSubscriptionImportErrorInfo({
        category: "network",
        message: "token=secret 404",
        detail: "C:/secret/path.txt",
        httpStatus: 404,
        at: 123,
      })
    ).toEqual({
      category: "network",
      message: "token=*** 404",
      detail: "[path]",
      httpStatus: 404,
      suggestedActions: ["确认订阅链接是否正确", "联系订阅提供方确认链接有效性"],
      at: 123,
    });
    expect(
      createSubscriptionImportErrorInfo({
        category: "security",
        message: "blocked",
        suggestedActions: ["custom"],
        at: 1,
      }).suggestedActions
    ).toEqual(["custom"]);
  });

  it("uses status, category, and service-message defaults for suggestions", () => {
    expect(
      createSubscriptionImportErrorInfo({ category: "network", message: "401", httpStatus: 401 }).suggestedActions
    ).toEqual(["检查订阅链接中的 Token/Key 是否正确", "确认订阅是否已过期"]);
    expect(
      createSubscriptionImportErrorInfo({ category: "network", message: "403", httpStatus: 403 }).suggestedActions
    ).toEqual(["检查订阅链接中的 Token/Key 是否正确", "确认订阅是否已过期"]);
    expect(
      createSubscriptionImportErrorInfo({ category: "network", message: "429", httpStatus: 429 }).suggestedActions
    ).toEqual(["请求过于频繁，请稍后再试", "降低客户端订阅更新频率"]);
    expect(
      createSubscriptionImportErrorInfo({ category: "network", message: "服务暂时不可用，请稍后再试" }).suggestedActions
    ).toEqual(["稍后再试", "如持续出现，请联系管理员"]);
    expect(createSubscriptionImportErrorInfo({ category: "parse", message: "bad yaml" }).suggestedActions).toEqual([
      "检查配置文件格式是否正确",
      "尝试使用在线工具验证配置语法",
    ]);
    expect(createSubscriptionImportErrorInfo({ category: "format", message: "bad url" }).suggestedActions).toEqual([
      "检查输入内容格式",
      "确认使用正确的导入方式",
    ]);
  });

  it("builds compact badge text and category labels", () => {
    expect(
      getSubscriptionImportErrorBadgeText({
        category: "network",
        message: "failed",
        httpStatus: 503,
        suggestedActions: [],
        at: 1,
      })
    ).toBe("503");
    expect(
      getSubscriptionImportErrorBadgeText({
        category: "network",
        message: "connect ETIMEDOUT",
        suggestedActions: [],
        at: 1,
      })
    ).toBe("超时");
    expect(
      getSubscriptionImportErrorBadgeText({
        category: "security",
        message: "blocked",
        isUserFacingReason: true,
        suggestedActions: [],
        at: 1,
      })
    ).toBe("提示");
    expect(
      getSubscriptionImportErrorBadgeText(
        {
          category: "format",
          message: "bad",
          suggestedActions: [],
          at: 1,
        },
        2
      )
    ).toBe("格式");
    expect(
      getSubscriptionImportErrorBadgeText({
        category: "network",
        message: "upstream failed",
        detail: "remote returned 502",
        suggestedActions: [],
        at: 1,
      })
    ).toBe("502");
    expect(
      getSubscriptionImportErrorBadgeText({
        category: "network",
        message: "connection failed",
        networkCode: "ECONNREFUSED",
        suggestedActions: [],
        at: 1,
      })
    ).toBe("拒绝");
    expect(
      getSubscriptionImportErrorBadgeText({
        category: "network",
        message: "域名解析失败",
        suggestedActions: [],
        at: 1,
      })
    ).toBe("DNS");
    expect(
      getSubscriptionImportErrorBadgeText(
        {
          category: "parse",
          message: "bad",
          suggestedActions: [],
          at: 1,
        },
        1
      )
    ).toBe("…");
    expect(
      getSubscriptionImportErrorBadgeText({
        category: "security",
        message: "blocked",
        suggestedActions: [],
        at: 1,
      })
    ).toBe("安全");
    expect(getSubscriptionImportErrorCategoryLabel("network")).toBe("网络错误");
    expect(getSubscriptionImportErrorCategoryLabel("parse")).toBe("解析错误");
    expect(getSubscriptionImportErrorCategoryLabel("format")).toBe("格式错误");
    expect(getSubscriptionImportErrorCategoryLabel("security")).toBe("安全拦截");
  });

  it("normalizes structured, string, and class-wrapped errors", () => {
    const info = createSubscriptionImportErrorInfo({
      category: "parse",
      message: "YAML 解析失败",
      at: 7,
    });
    const wrapped = new SubscriptionImportError(info);

    expect(isSubscriptionImportError(wrapped)).toBe(true);
    expect(normalizeSubscriptionImportErrorInfo(wrapped)).toBe(info);
    expect(normalizeSubscriptionImportErrorInfo("DNS timeout")).toMatchObject({
      category: "network",
      message: "DNS timeout",
    });
    expect(
      normalizeSubscriptionImportErrorInfo({
        category: "security",
        message: "禁止访问",
        detail: "10.0.0.1",
        suggestedActions: ["换一个链接", 1],
        at: 9,
      })
    ).toEqual({
      category: "security",
      message: "禁止访问",
      detail: "[IP]",
      suggestedActions: ["换一个链接"],
      at: 9,
    });
    expect(normalizeSubscriptionImportErrorInfo(null)).toBeNull();
    expect(normalizeSubscriptionImportErrorInfo("   ")).toBeNull();
    expect(normalizeSubscriptionImportErrorInfo(404)).toBeNull();
    expect(
      normalizeSubscriptionImportErrorInfo({
        category: "network",
        message: "reset",
        detail: 1,
        isUserFacingReason: true,
        httpStatus: 500,
        networkCode: "ECONNRESET",
        suggestedActions: ["重试", false, "联系管理员"],
        at: 11,
      })
    ).toEqual({
      category: "network",
      message: "reset",
      isUserFacingReason: true,
      httpStatus: 500,
      networkCode: "ECONNRESET",
      suggestedActions: ["重试", "联系管理员"],
      at: 11,
    });
    expect(normalizeSubscriptionImportErrorInfo({ category: "bad", message: "x" })).toBeNull();
  });
});
