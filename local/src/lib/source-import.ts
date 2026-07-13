import { lookup } from "node:dns/promises";
import {
  createSubscriptionImportErrorInfo,
  inferSubscriptionImportErrorCategory,
  sanitizePublicErrorText,
} from "@subboost/core/subscription/import-error";
import {
  importSubscriptionFromUrl,
  SUBSCRIPTION_IMPORT_USER_AGENTS,
  type SourceImportRequest,
  type SourceImportResult,
  type SourceImportTransportRequest,
  type SourceImportTransportResult,
} from "@subboost/server-core/subscription";
import { resolveHostnameByDoh } from "@subboost/server-core/subscription/doh-resolver";
import {
  isPrivateOrReservedIp,
  normalizeResolvedIpAddresses,
  selectDnsAddressesAfterFakeIpRecheck,
  shouldRecheckFakeIpDnsAnswers,
} from "@subboost/server-core/subscription/ssrf-ip";
import { getAllowUnsafeSubscriptionSources } from "@local/lib/source-import-settings";

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const USERINFO_TIMEOUT_MS = 8000;
const USERINFO_MAX_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;
const DOH_TIMEOUT_MS = 4000;

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function toFailure(message: string, status?: number): SourceImportTransportResult {
  const sanitized = sanitizePublicErrorText(message) || "获取 url 失败";
  return {
    ok: false,
    error: sanitized,
    responseStatus: status,
    publicReason: status ? `HTTP ${status}` : sanitized,
    errorInfo: createSubscriptionImportErrorInfo({
      category: inferSubscriptionImportErrorCategory(sanitized),
      message: sanitized,
      detail: sanitized,
      httpStatus: status,
    }),
  };
}

function toSecurityFailure(message: string): SourceImportTransportResult {
  return {
    ok: false,
    error: message,
    publicReason: message,
    errorInfo: createSubscriptionImportErrorInfo({
      category: "security",
      message,
      detail: message,
    }),
  };
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

async function validatePublicFetchTarget(
  url: string,
  allowUnsafeSubscriptionSources: boolean
): Promise<SourceImportTransportResult | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return toSecurityFailure("无效的订阅 URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return toSecurityFailure("只支持 HTTP 或 HTTPS 订阅 URL");
  }

  if (parsed.username || parsed.password) {
    return toSecurityFailure("订阅 URL 不允许包含用户名或密码");
  }

  if (allowUnsafeSubscriptionSources) return null;

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    return toSecurityFailure("禁止访问本机或内网地址");
  }

  if (isPrivateOrReservedIp(hostname)) {
    return toSecurityFailure("禁止访问本机或内网地址");
  }

  const records = await lookup(hostname, { all: true, verbatim: true }).catch(() => []);
  const addresses = normalizeResolvedIpAddresses(records.map((record) => record.address));
  const finalAddresses = shouldRecheckFakeIpDnsAnswers(addresses)
    ? selectDnsAddressesAfterFakeIpRecheck(
        addresses,
        await resolveHostnameByDoh(hostname, { timeoutMs: DOH_TIMEOUT_MS })
      )
    : addresses;
  const addressesToCheck = finalAddresses.length > 0 ? finalAddresses : addresses;
  if (addressesToCheck.some((address) => isPrivateOrReservedIp(address))) {
    return toSecurityFailure("禁止访问本机或内网地址");
  }

  return null;
}

async function fetchTextDirect(
  request: SourceImportTransportRequest,
  allowUnsafeSubscriptionSources: boolean
): Promise<SourceImportTransportResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);

  try {
    let currentUrl = request.url;
    let response: Response | null = null;
    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const guardFailure = await validatePublicFetchTarget(currentUrl, allowUnsafeSubscriptionSources);
      if (guardFailure) return guardFailure;

      response = await fetch(currentUrl, {
        method: request.purpose === "userinfo" ? "HEAD" : "GET",
        headers: {
          "User-Agent": request.userAgent,
          Accept: "text/plain, application/yaml, application/x-yaml, */*;q=0.8",
          "Cache-Control": "no-cache",
        },
        redirect: "manual",
        signal: controller.signal,
      });

      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location) break;
      currentUrl = new URL(location, currentUrl).toString();
      response = null;
    }

    if (!response) return toFailure("订阅重定向次数过多", 310);
    const headers = headersToRecord(response.headers);
    const contentLength = Number(headers["content-length"] || "0");
    if (Number.isFinite(contentLength) && contentLength > request.maxBytes) {
      return toFailure("订阅响应过大", 413);
    }

    const content = request.purpose === "userinfo" ? "" : await response.text();
    if (new TextEncoder().encode(content).length > request.maxBytes) {
      return toFailure("订阅响应过大", 413);
    }
    if (!response.ok) {
      return toFailure(`HTTP ${response.status}`, response.status);
    }

    return {
      ok: true,
      content,
      headers,
      responseStatus: response.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toFailure(message);
  } finally {
    clearTimeout(timer);
  }
}

export async function importSourceUrlDirect(request: SourceImportRequest): Promise<SourceImportResult> {
  const allowUnsafeSubscriptionSources = await getAllowUnsafeSubscriptionSources();
  return importSubscriptionFromUrl(request, {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxBytes: DEFAULT_MAX_BYTES,
    fetchText: (transportRequest) => fetchTextDirect(transportRequest, allowUnsafeSubscriptionSources),
  });
}

export async function fetchSourceUserInfoHeadersDirect(source: {
  userinfoUrl?: string;
  userinfoUserAgent?: string;
}): Promise<Record<string, string> | undefined> {
  if (!source.userinfoUrl) return undefined;
  const allowUnsafeSubscriptionSources = await getAllowUnsafeSubscriptionSources();
  const response = await fetchTextDirect(
    {
      url: source.userinfoUrl,
      userAgent: source.userinfoUserAgent?.trim() || SUBSCRIPTION_IMPORT_USER_AGENTS[0],
      purpose: "userinfo",
      timeoutMs: USERINFO_TIMEOUT_MS,
      maxBytes: USERINFO_MAX_BYTES,
    },
    allowUnsafeSubscriptionSources
  );
  return response.ok ? response.headers : undefined;
}
