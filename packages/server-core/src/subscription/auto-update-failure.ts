import { createHash } from "node:crypto";
import { safeParseJsonObject } from "@subboost/core/json";
import { extractHttpStatus } from "@subboost/core/subscription/import-error";

// Product-neutral failure policy shared by server adapters.
export const AUTO_UPDATE_EXTERNAL_FAILURE_THRESHOLD = 3;
export const AUTO_UPDATE_DISABLED_REASON = "订阅源连续拉取失败";

export type AutoUpdateFailureSourceLike = {
  id?: string | null;
  type?: string | null;
  content?: string | null;
  errorMessage?: string | null;
  errorCategory?: string | null;
  httpStatus?: number | null;
  responseStatus?: number | null;
  publicReason?: string | null;
};

export type AutoUpdateFailureClassification = {
  isStableExternalFailure: boolean;
  reason: string;
};

export type AutoUpdateFailureSourceStreak = {
  count: number;
  fingerprint: string;
  reason: string;
  lastFailedAt: string;
};

export type AutoUpdateFailureSourceState = Record<string, AutoUpdateFailureSourceStreak>;

export type AutoUpdateFailureSourceUpdate = {
  sourceId: string;
  count: number;
  isStableExternalFailure: boolean;
  reason: string;
};

export type AutoUpdateFailureSourceStateUpdate = {
  sourceState: AutoUpdateFailureSourceState;
  serializedSourceState: string | null;
  maxFailureCount: number;
  stableFailedSources: AutoUpdateFailureSourceUpdate[];
  failedSources: AutoUpdateFailureSourceUpdate[];
  disableSource: AutoUpdateFailureSourceUpdate | null;
  shouldDisableAutoUpdate: boolean;
};

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

function sourceStateKey(source: AutoUpdateFailureSourceLike): string {
  const id = normalizeText(source.id);
  if (id) return id;
  return sourceFingerprint(source);
}

function sourceFingerprint(source: AutoUpdateFailureSourceLike): string {
  const type = normalizeText(source.type);
  const content = normalizeText(source.content);
  return createHash("sha256").update(`${type}\n${content}`).digest("hex").slice(0, 32);
}

export function parseAutoUpdateFailureSourceState(raw: string | null | undefined): AutoUpdateFailureSourceState {
  const text = normalizeText(raw);
  if (!text) return {};

  const parsed = safeParseJsonObject(text);
  if (!parsed) return {};

  const state: AutoUpdateFailureSourceState = {};
  for (const [sourceId, value] of Object.entries(parsed)) {
    const streak =
      value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    if (!streak) continue;

    const count = normalizePositiveInteger(streak.count);
    const fingerprint = normalizeText(streak.fingerprint);
    const reason = normalizeText(streak.reason);
    const lastFailedAt = normalizeText(streak.lastFailedAt);
    if (!count || !fingerprint || !reason || !lastFailedAt) continue;

    state[sourceId] = { count, fingerprint, reason, lastFailedAt };
  }
  return state;
}

export function serializeAutoUpdateFailureSourceState(state: AutoUpdateFailureSourceState): string | null {
  return Object.keys(state).length > 0 ? JSON.stringify(state) : null;
}

export function classifyStableExternalAutoUpdateFailure(
  source: AutoUpdateFailureSourceLike
): AutoUpdateFailureClassification {
  const message = normalizeText(source.errorMessage);
  const publicReason = normalizeText(source.publicReason);
  const category = normalizeText(source.errorCategory);
  const text = `${message}\n${publicReason}`;
  const lower = text.toLowerCase();
  const status = source.httpStatus ?? source.responseStatus ?? extractHttpStatus(text);

  if (
    text.includes("当前解析任务较多") ||
    text.includes("服务暂时不可用，请稍后再试") ||
    text.includes("没有可用的代理服务器")
  ) {
    return { isStableExternalFailure: false, reason: "项目侧队列或代理资源暂不可用" };
  }

  if (
    text.includes("请求超时") ||
    text.includes("连接被重置") ||
    text.includes("连接被拒绝") ||
    text.includes("网络不可达") ||
    /timeout|etimedout|econnreset|econnrefused|socket hang up/i.test(text)
  ) {
    return { isStableExternalFailure: true, reason: "订阅源网络链路失败" };
  }

  if (typeof status === "number") {
    if (status >= 500 && status < 600) {
      return { isStableExternalFailure: false, reason: `目标服务临时错误 HTTP ${status}` };
    }
    if (status === 408) {
      return { isStableExternalFailure: true, reason: "订阅源请求超时 HTTP 408" };
    }
    if (status >= 400 && status < 500) {
      return { isStableExternalFailure: true, reason: `目标订阅服务返回 HTTP ${status}` };
    }
  }

  if (
    category === "format" ||
    category === "parse" ||
    /yaml|json|parse|syntax|base64|格式|解析失败|未解析到可用节点|未导入该结果|客户端更新提示占位内容/i.test(
      lower
    )
  ) {
    return { isStableExternalFailure: true, reason: "订阅内容格式或解析失败" };
  }

  if (
    category === "security" ||
    text.includes("URL 验证失败") ||
    text.includes("无效的 URL") ||
    text.includes("只支持 HTTP") ||
    text.includes("禁止访问") ||
    text.includes("内网")
  ) {
    return { isStableExternalFailure: true, reason: "订阅 URL 不符合公网拉取要求" };
  }

  if (
    text.includes("域名解析失败") ||
    /enotfound|eai_again|dns/i.test(lower) ||
    /cert|certificate|altnames|tls_cert|has_expired/i.test(lower)
  ) {
    return { isStableExternalFailure: true, reason: "订阅域名或证书异常" };
  }

  return { isStableExternalFailure: false, reason: "失败原因不满足稳定外部失败口径" };
}

export function updateAutoUpdateFailureSourceState(params: {
  previousStateRaw: string | null | undefined;
  sources: AutoUpdateFailureSourceLike[];
  failedSources: AutoUpdateFailureSourceLike[];
  failedAt: Date;
  threshold?: number;
}): AutoUpdateFailureSourceStateUpdate {
  const previousState = parseAutoUpdateFailureSourceState(params.previousStateRaw);
  const failedBySourceId = new Map<string, AutoUpdateFailureSourceLike>();
  for (const source of params.failedSources) {
    failedBySourceId.set(sourceStateKey(source), source);
  }

  const nextState: AutoUpdateFailureSourceState = {};
  const failedSources: AutoUpdateFailureSourceUpdate[] = [];
  const failedAtIso = params.failedAt.toISOString();

  for (const source of params.sources) {
    const sourceId = sourceStateKey(source);
    const failedSource = failedBySourceId.get(sourceId);
    if (!failedSource) continue;

    const failure = classifyStableExternalAutoUpdateFailure(failedSource);
    if (!failure.isStableExternalFailure) {
      failedSources.push({
        sourceId,
        count: 0,
        isStableExternalFailure: false,
        reason: failure.reason,
      });
      continue;
    }

    const fingerprint = sourceFingerprint(source);
    const previous = previousState[sourceId];
    const previousCount = previous?.fingerprint === fingerprint ? previous.count : 0;
    const count = previousCount + 1;
    nextState[sourceId] = {
      count,
      fingerprint,
      reason: failure.reason,
      lastFailedAt: failedAtIso,
    };
    failedSources.push({
      sourceId,
      count,
      isStableExternalFailure: true,
      reason: failure.reason,
    });
  }

  const stableFailedSources = failedSources.filter((source) => source.isStableExternalFailure);
  const maxFailureCount = Object.values(nextState).reduce((max, source) => Math.max(max, source.count), 0);
  const threshold = params.threshold ?? AUTO_UPDATE_EXTERNAL_FAILURE_THRESHOLD;
  const disableSource =
    stableFailedSources
      .filter((source) => source.count >= threshold)
      .sort((a, b) => b.count - a.count)[0] ?? null;

  return {
    sourceState: nextState,
    serializedSourceState: serializeAutoUpdateFailureSourceState(nextState),
    maxFailureCount,
    stableFailedSources,
    failedSources,
    disableSource,
    shouldDisableAutoUpdate: Boolean(disableSource),
  };
}
