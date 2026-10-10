import { parseSubscription } from "@subboost/core/parser";
import {
  hasClientUpdatePlaceholderError,
  looksLikeClientUpdatePlaceholderNodes,
} from "@subboost/core/parser/placeholder";
import {
  createSubscriptionImportErrorInfo,
  inferSubscriptionImportErrorCategory,
  sanitizePublicErrorText,
  type SubscriptionImportErrorInfo,
} from "@subboost/core/subscription/import-error";
import { tryNormalizeSubscriptionUrlInput } from "@subboost/core/subscription/url-input";
import type { ParseResult, ParsedNode } from "@subboost/core/types/node";
import { compareSubscriptionSnapshots, createSubscriptionRequestBudget, hasUsableSubscriptionSnapshot, SUBSCRIPTION_MAX_PROFILE_REQUESTS,
  type SubscriptionSnapshotComparison } from "./snapshot-comparison";
import { SUBSCRIPTION_IMPORT_USER_AGENTS } from "./user-agents";

export type SourceImportPurpose = "content" | "userinfo";

export type SourceImportTransportRequest = {
  url: string;
  userAgent: string;
  purpose: SourceImportPurpose;
  timeoutMs: number;
  maxBytes: number;
};

export type SourceImportTransportResult = {
  ok: boolean;
  content?: string;
  headers?: Record<string, string>;
  error?: string;
  errorInfo?: SubscriptionImportErrorInfo | null;
  responseStatus?: number;
  publicReason?: string | null;
};

export type SourceImportRequest = {
  url: string;
  userinfoUrl?: string;
  userinfoUserAgent?: string;
};

export type SourceImportSuccess = {
  ok: true;
  content: string;
  headers: Record<string, string>;
  parsedNodes: ParsedNode[];
  sourceConfig?: Record<string, unknown>;
  resolvedHosts?: Record<string, string[]>;
  parseErrors: string[];
  diagnostics?: SubscriptionSnapshotComparison[];
};

export type SourceImportFailure = {
  ok: false;
  error: string;
  errorInfo: SubscriptionImportErrorInfo;
  responseStatus?: number;
  publicReason?: string | null;
};

export type SourceImportResult = SourceImportSuccess | SourceImportFailure;

export function buildSourceImportParseResult(
  result: Pick<SourceImportSuccess, "parsedNodes" | "parseErrors" | "sourceConfig" | "resolvedHosts">
): ParseResult {
  const nodes = result.parsedNodes;
  const errors = result.parseErrors;
  return {
    nodes,
    errors,
    totalParsed: nodes.length,
    totalFailed: errors.length,
    ...(result.sourceConfig ? { sourceConfig: result.sourceConfig } : {}),
    ...(result.resolvedHosts ? { resolvedHosts: result.resolvedHosts } : {}),
  };
}

type ParsedAttempt =
  | {
      ok: true;
      userAgent: string;
      content: string;
      headers: Record<string, string>;
      parsed: ParseResult;
    }
  | {
      ok: false;
      userAgent: string;
      error: string;
      errorInfo?: SubscriptionImportErrorInfo | null;
      responseStatus?: number;
      publicReason?: string | null;
    };

function createErrorInfo(message: string, httpStatus?: number): SubscriptionImportErrorInfo {
  return createSubscriptionImportErrorInfo({
    category: inferSubscriptionImportErrorCategory(message),
    message,
    detail: message,
    httpStatus,
  });
}

function isUsableParsedAttempt(attempt: ParsedAttempt): attempt is Extract<ParsedAttempt, { ok: true }> {
  return attempt.ok && hasUsableSubscriptionSnapshot(attempt.parsed);
}

function toFailure(attempt: ParsedAttempt | null, fallback = "获取 url 失败"): SourceImportFailure {
  if (!attempt) {
    return {
      ok: false,
      error: fallback,
      errorInfo: createErrorInfo(fallback),
    };
  }

  if (!attempt.ok) {
    const message = sanitizePublicErrorText(attempt.error) || fallback;
    return {
      ok: false,
      error: message,
      errorInfo: attempt.errorInfo ?? createErrorInfo(message, attempt.responseStatus),
      responseStatus: attempt.responseStatus,
      publicReason: attempt.publicReason ?? null,
    };
  }

  const parseError = attempt.parsed.errors[0] || "未解析到有效节点";
  const message = hasClientUpdatePlaceholderError(attempt.parsed.errors) ||
    looksLikeClientUpdatePlaceholderNodes(attempt.parsed.nodes)
    ? "订阅服务返回了客户端更新提示占位内容，未导入该结果"
    : parseError;
  return {
    ok: false,
    error: message,
    errorInfo: createSubscriptionImportErrorInfo({
      category: "parse",
      message,
      detail: parseError,
    }),
  };
}

function pickBetterAttempt(current: ParsedAttempt | null, next: ParsedAttempt, diagnostics: SubscriptionSnapshotComparison[]): ParsedAttempt {
  if (!current) return next;
  const comparison = current.ok && next.ok ? compareSubscriptionSnapshots(current.parsed, next.parsed) : null;
  if (comparison) diagnostics.push(comparison);
  const currentUsable = isUsableParsedAttempt(current);
  const nextUsable = isUsableParsedAttempt(next);
  if (currentUsable !== nextUsable) return nextUsable ? next : current;
  if (current.ok !== next.ok) return next.ok ? next : current;
  if (!current.ok || !next.ok) return current;
  return comparison?.selected === "next" ? next : current;
}

function normalizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const normalizedKey = key.toLowerCase().trim();
    if (!normalizedKey || typeof value !== "string") continue;
    out[normalizedKey] = value;
  }
  return out;
}

async function fetchAndParseWithUserAgent(
  url: string,
  userAgent: string,
  options: {
    timeoutMs: number;
    maxBytes: number;
    fetchText: (request: SourceImportTransportRequest) => Promise<SourceImportTransportResult>;
  }
): Promise<ParsedAttempt> {
  let response: SourceImportTransportResult;
  try {
    response = await options.fetchText({
      url,
      userAgent,
      purpose: "content",
      timeoutMs: options.timeoutMs,
      maxBytes: options.maxBytes,
    });
  } catch {
    response = { ok: false, error: "订阅请求失败" };
  }
  if (!response.ok || typeof response.content !== "string") {
    const message = sanitizePublicErrorText(response.error) || "获取 url 失败";
    return {
      ok: false,
      userAgent,
      error: message,
      errorInfo: response.errorInfo,
      responseStatus: response.responseStatus,
      publicReason: response.publicReason ?? null,
    };
  }

  return {
    ok: true,
    userAgent,
    content: response.content,
    headers: normalizeHeaders(response.headers),
    parsed: parseSubscription(response.content),
  };
}

async function fetchSupplementalUserInfoHeaders(
  request: SourceImportRequest,
  options: {
    timeoutMs: number;
    maxBytes: number;
    fetchText: (request: SourceImportTransportRequest) => Promise<SourceImportTransportResult>;
  },
  fallbackUrl: string
): Promise<Record<string, string>> {
  if (!request.userinfoUrl && !request.userinfoUserAgent) return {};
  const rawUrl = request.userinfoUrl || fallbackUrl;
  const url = tryNormalizeSubscriptionUrlInput(rawUrl);
  if (!url) return {};
  const response = await options.fetchText({
    url,
    userAgent: request.userinfoUserAgent?.trim() || SUBSCRIPTION_IMPORT_USER_AGENTS[0],
    purpose: "userinfo",
    timeoutMs: Math.min(options.timeoutMs, 8000),
    maxBytes: options.maxBytes,
  });
  return response.ok ? normalizeHeaders(response.headers) : {};
}

export async function importSubscriptionFromUrl(
  request: SourceImportRequest,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
    userAgents?: readonly string[];
    fetchText: (request: SourceImportTransportRequest) => Promise<SourceImportTransportResult>;
  }
): Promise<SourceImportResult> {
  const url = tryNormalizeSubscriptionUrlInput(request.url);
  if (!url) {
    return {
      ok: false,
      error: "无效的 url 格式",
      errorInfo: createSubscriptionImportErrorInfo({
        category: "format",
        message: "无效的 url 格式",
      }),
    };
  }
  const parsedUrl = new URL(url);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return {
      ok: false,
      error: "只支持 HTTP/HTTPS url",
      errorInfo: createSubscriptionImportErrorInfo({
        category: "format",
        message: "只支持 HTTP/HTTPS url",
      }),
    };
  }

  const timeoutMs = options.timeoutMs ?? 15000;
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  const userAgents = [...new Set(options.userAgents?.length ? options.userAgents : SUBSCRIPTION_IMPORT_USER_AGENTS)].slice(0, SUBSCRIPTION_MAX_PROFILE_REQUESTS);
  const budget = createSubscriptionRequestBudget(timeoutMs);
  const diagnostics: SubscriptionSnapshotComparison[] = [];
  let best: ParsedAttempt | null = null;
  const sourceConfigs: Record<string, unknown>[] = [];

  for (let index = 0; index < userAgents.length; index += 1) {
    const userAgent = userAgents[index];
    const remainingTimeout = budget.remainingTimeout();
    if (remainingTimeout === 0) break;
    const attempt = await fetchAndParseWithUserAgent(url, userAgent, {
      timeoutMs: remainingTimeout,
      maxBytes,
      fetchText: options.fetchText,
    });
    if (attempt.ok && isUsableParsedAttempt(attempt) && attempt.parsed.sourceConfig) sourceConfigs.push(attempt.parsed.sourceConfig);
    best = pickBetterAttempt(best, attempt, diagnostics);
  }

  if (!best || !best.ok || !isUsableParsedAttempt(best)) {
    return toFailure(best);
  }

  const supplementalHeaders = budget.remainingTimeout() === 0 ? {} : await fetchSupplementalUserInfoHeaders(request, {
    timeoutMs: budget.remainingTimeout(),
    maxBytes,
    fetchText: options.fetchText,
  }, url).catch(() => ({}));

  // Profile negotiation may choose richer nodes from a URI-only response. Keep
  // metadata obtained from a valid YAML response instead of dropping its hosts,
  // DNS and other sections merely because the winning format has no such fields.
  const mergeConfig = (left: Record<string, unknown>, right: Record<string, unknown>): Record<string, unknown> => {
    const merged = structuredClone(left);
    for (const [key, value] of Object.entries(right)) {
      const old = merged[key];
      merged[key] = old && value && typeof old === "object" && typeof value === "object" && !Array.isArray(old) && !Array.isArray(value)
        ? mergeConfig(old as Record<string, unknown>, value as Record<string, unknown>) : structuredClone(value);
    }
    return merged;
  };
  let sourceConfig = sourceConfigs.reduce((config, next) => mergeConfig(next, config), {});
  if (best.parsed.sourceConfig) sourceConfig = mergeConfig(sourceConfig, best.parsed.sourceConfig);

  return {
    ok: true,
    content: best.content,
    headers: { ...best.headers, ...supplementalHeaders },
    parsedNodes: best.parsed.nodes,
    ...(Object.keys(sourceConfig).length ? { sourceConfig } : {}),
    parseErrors: best.parsed.errors,
    diagnostics,
  };
}
