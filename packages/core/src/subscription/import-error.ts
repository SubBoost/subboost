/**
 * 订阅导入错误处理模块
 * 提供结构化错误信息、安全过滤、Badge文字提取等功能
 */

export type SubscriptionImportErrorCategory = "network" | "parse" | "format" | "security";

export interface SubscriptionImportErrorInfo {
  category: SubscriptionImportErrorCategory;
  message: string;
  detail?: string;
  isUserFacingReason?: boolean;
  httpStatus?: number;
  networkCode?: string;
  suggestedActions: string[];
  at: number;
}

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /token=[^&\s]*/gi, replacement: "token=***" },
  { pattern: /key=[^&\s]*/gi, replacement: "key=***" },
  { pattern: /password=[^&\s]*/gi, replacement: "password=***" },
  { pattern: /secret=[^&\s]*/gi, replacement: "secret=***" },
  { pattern: /auth=[^&\s]*/gi, replacement: "auth=***" },
  { pattern: /(\d{1,3}\.){3}\d{1,3}(:\d+)?/g, replacement: "[IP]" },
  { pattern: /\[[0-9a-fA-F:]+\](:\d+)?/g, replacement: "[IPv6]" },
  { pattern: /[a-f0-9]{32,}/gi, replacement: "[hash]" },
  { pattern: /(^|[^A-Za-z0-9])([A-Za-z]:[\\\/][^\s"]*)/g, replacement: "$1[path]" },
  { pattern: /\/(?:Users|home|var|tmp|etc)\/[^\s"]*/gi, replacement: "[path]" },
];

export function sanitizePublicErrorText(text: string | undefined | null): string {
  if (!text) return "";
  let result = text;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result.trim();
}

export function maskUrlForPublicDisplay(url: string): string {
  try {
    const parsed = new URL(url);
    const hasPath = parsed.pathname && parsed.pathname !== "/";
    return `${parsed.protocol}//${parsed.host}${hasPath ? "/***" : ""}${parsed.search ? "?***" : ""}`;
  } catch {
    return url.slice(0, 30) + "...";
  }
}

const HTTP_STATUS_BADGE: Record<number, string> = {
  400: "400",
  401: "401",
  403: "403",
  404: "404",
  429: "429",
  500: "500",
  502: "502",
  503: "503",
  504: "504",
};

const NETWORK_CODE_BADGE: Record<string, string> = {
  ECONNREFUSED: "拒绝",
  ECONNRESET: "重置",
  ETIMEDOUT: "超时",
  ESOCKETTIMEDOUT: "超时",
  EHOSTUNREACH: "不可达",
  ENETUNREACH: "不可达",
  ENOTFOUND: "DNS",
  EAI_AGAIN: "DNS",
};

export function extractHttpStatus(text: string): number | null {
  const match = text.match(
    /\b(?:HTTP(?:\/\d(?:\.\d)?)?|status(?:\s+code)?|returned|responded(?:\s+with)?)\s*[:=]?\s*(\d{3})\b/i
  );
  if (!match) return null;
  const code = Number.parseInt(match[1], 10);
  return code >= 400 && code < 600 ? code : null;
}

function extractNetworkCodeFromText(text: string): string | null {
  const upper = text.toUpperCase();
  for (const code of Object.keys(NETWORK_CODE_BADGE)) {
    if (upper.includes(code)) return code;
  }
  if (/超时|timeout/i.test(text)) return "ETIMEDOUT";
  if (/拒绝|refused/i.test(text)) return "ECONNREFUSED";
  if (/dns|域名/i.test(text)) return "ENOTFOUND";
  return null;
}

export function inferSubscriptionImportErrorCategory(text: string): SubscriptionImportErrorCategory {
  const lower = text.toLowerCase();
  if (/yaml|json|parse|syntax|格式|解析失败|base64/i.test(lower)) return "parse";
  if (/无效.*url|只支持.*http|url.*格式/i.test(lower)) return "format";
  if (/禁止访问|内网|安全|拦截|URL 验证失败/i.test(text)) return "security";
  return "network";
}

function getDefaultSuggestions(
  category: SubscriptionImportErrorCategory,
  httpStatus?: number,
  message?: string
): string[] {
  if (httpStatus === 401 || httpStatus === 403) {
    return ["检查订阅链接中的 Token/Key 是否正确", "确认订阅是否已过期"];
  }
  if (httpStatus === 404) {
    return ["确认订阅链接是否正确", "联系订阅提供方确认链接有效性"];
  }
  if (httpStatus === 429) {
    return ["请求过于频繁，请稍后再试", "降低客户端订阅更新频率"];
  }
  const msg = (message || "").trim();
  if (msg === "服务暂时不可用，请稍后再试") {
    return ["稍后再试", "如持续出现，请联系管理员"];
  }
  switch (category) {
    case "network":
      return ["检查网络连接", "确认目标服务器是否在线"];
    case "parse":
      return ["检查配置文件格式是否正确", "尝试使用在线工具验证配置语法"];
    case "format":
      return ["检查输入内容格式", "确认使用正确的导入方式"];
    case "security":
      return ["仅支持公网 HTTP/HTTPS 订阅链接", "请勿使用本地/内网地址或受限端口"];
  }
}

export function createSubscriptionImportErrorInfo(
  input: Omit<SubscriptionImportErrorInfo, "suggestedActions" | "at"> & {
    suggestedActions?: string[];
    at?: number;
  }
): SubscriptionImportErrorInfo {
  const suggestions = input.suggestedActions?.length
    ? input.suggestedActions
    : getDefaultSuggestions(input.category, input.httpStatus, input.message);
  return {
    category: input.category,
    message: sanitizePublicErrorText(input.message),
    detail: input.detail ? sanitizePublicErrorText(input.detail) : undefined,
    isUserFacingReason: input.isUserFacingReason === true ? true : undefined,
    httpStatus: input.httpStatus,
    networkCode: input.networkCode,
    suggestedActions: suggestions,
    at: input.at ?? Date.now(),
  };
}

function truncateBadgeText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + "…";
}

export function getSubscriptionImportErrorBadgeText(
  info: SubscriptionImportErrorInfo,
  maxChars = 6
): string {
  if (info.isUserFacingReason === true) {
    return truncateBadgeText("提示", maxChars);
  }

  if (info.httpStatus && HTTP_STATUS_BADGE[info.httpStatus]) {
    return HTTP_STATUS_BADGE[info.httpStatus];
  }
  const httpFromText = extractHttpStatus(info.message) ?? extractHttpStatus(info.detail || "");
  if (httpFromText && HTTP_STATUS_BADGE[httpFromText]) {
    return HTTP_STATUS_BADGE[httpFromText];
  }
  if (info.networkCode && NETWORK_CODE_BADGE[info.networkCode]) {
    return truncateBadgeText(NETWORK_CODE_BADGE[info.networkCode], maxChars);
  }
  const netCode = extractNetworkCodeFromText(info.message) ?? extractNetworkCodeFromText(info.detail || "");
  if (netCode && NETWORK_CODE_BADGE[netCode]) {
    return truncateBadgeText(NETWORK_CODE_BADGE[netCode], maxChars);
  }
  const fallback =
    info.category === "format"
      ? "格式"
      : info.category === "parse"
        ? "解析"
        : info.category === "security"
          ? "安全"
          : "网络";
  return truncateBadgeText(fallback, maxChars);
}

export function getSubscriptionImportErrorCategoryLabel(category: SubscriptionImportErrorCategory): string {
  switch (category) {
    case "network":
      return "网络错误";
    case "parse":
      return "解析错误";
    case "format":
      return "格式错误";
    case "security":
      return "安全拦截";
  }
}

export class SubscriptionImportError extends Error {
  public readonly info: SubscriptionImportErrorInfo;

  constructor(info: SubscriptionImportErrorInfo) {
    super(info.message);
    this.name = "SubscriptionImportError";
    this.info = info;
  }
}

export function isSubscriptionImportError(error: unknown): error is SubscriptionImportError {
  return error instanceof SubscriptionImportError;
}

export function normalizeSubscriptionImportErrorInfo(
  input: unknown
): SubscriptionImportErrorInfo | null {
  if (!input) return null;
  if (input instanceof SubscriptionImportError) return input.info;

  if (typeof input === "string") {
    const message = sanitizePublicErrorText(input);
    if (!message) return null;
    return createSubscriptionImportErrorInfo({
      category: inferSubscriptionImportErrorCategory(message),
      message,
      detail: message,
    });
  }

  if (typeof input !== "object") return null;
  const record = input as Record<string, unknown>;

  if (
    record.category &&
    (record.category === "network" || record.category === "parse" || record.category === "format" || record.category === "security") &&
    typeof record.message === "string"
  ) {
    return createSubscriptionImportErrorInfo({
      category: record.category,
      message: record.message,
      detail: typeof record.detail === "string" ? record.detail : undefined,
      isUserFacingReason: record.isUserFacingReason === true,
      httpStatus: typeof record.httpStatus === "number" ? record.httpStatus : undefined,
      networkCode: typeof record.networkCode === "string" ? record.networkCode : undefined,
      suggestedActions: Array.isArray(record.suggestedActions)
        ? record.suggestedActions.filter((v): v is string => typeof v === "string")
        : undefined,
      at: typeof record.at === "number" ? record.at : undefined,
    });
  }

  return null;
}
