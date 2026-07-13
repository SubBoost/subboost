import type { ParsedNode } from "../types/node";

/**
 * subscription-userinfo 解析与聚合
 */

/**
 * 解析 subscription-userinfo 头
 */
export function parseSubscriptionUserInfo(header: string): SubscriptionUserInfo {
  const info: Record<string, number> = {};
  
  const parts = header.split(";").map((p) => p.trim());
  for (const part of parts) {
    const [key, rawValue] = part.split("=").map((s) => s.trim());
    const value = decodeHeaderValue(rawValue);
    if (key && value) {
      const numeric = parseHeaderNumericValue(value);
      if (numeric !== undefined) {
        const normalizedNumeric = key === "expire" ? normalizeExpireTimestampSeconds(numeric) : numeric;
        if (normalizedNumeric !== undefined) info[key] = normalizedNumeric;
        continue;
      }

      // 支持少量服务端返回的日期型 expire（如 2026-02-19 / 2026-02-19T00:00:00Z）
      if (key === "expire") {
        const ts = parseDateLikeToTimestampSeconds(value);
        if (ts !== undefined) {
          info[key] = ts;
        }
      }
    }
  }

  return {
    upload: info.upload,
    download: info.download,
    total: info.total,
    expire: info.expire,
  };
}

export type SubscriptionUserInfo = {
  upload?: number;
  download?: number;
  total?: number;
  expire?: number;
};

type SubscriptionInfoNodeHints = {
  remainingBytes?: number;
  usedBytes?: number;
  totalBytes?: number;
  expire?: number;
};

function decodeHeaderValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseHeaderNumericValue(value: string): number | undefined {
  if (!/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)) return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return undefined;
  return Math.floor(numeric);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

const MIN_EXPIRE_TIMESTAMP_SECONDS = 946684800; // 2000-01-01
const MAX_EXPIRE_TIMESTAMP_SECONDS = 253402300799; // 9999-12-31T23:59:59Z
const MIN_EXPIRE_TIMESTAMP_MILLISECONDS = MIN_EXPIRE_TIMESTAMP_SECONDS * 1000;
const MAX_EXPIRE_TIMESTAMP_MILLISECONDS = MAX_EXPIRE_TIMESTAMP_SECONDS * 1000;

function normalizeExpireTimestampSeconds(value: unknown): number | undefined {
  if (!isFiniteNonNegativeNumber(value)) return undefined;
  const integer = Math.floor(value);
  if (integer > MIN_EXPIRE_TIMESTAMP_SECONDS && integer <= MAX_EXPIRE_TIMESTAMP_SECONDS) return integer;
  if (integer > MIN_EXPIRE_TIMESTAMP_MILLISECONDS && integer <= MAX_EXPIRE_TIMESTAMP_MILLISECONDS) {
    return Math.floor(integer / 1000);
  }
  return undefined;
}

function isValidExpireTimestampSeconds(value: unknown): value is number {
  return typeof value === "number" && normalizeExpireTimestampSeconds(value) === value;
}

function hasMeaningfulTrafficSnapshot(info: SubscriptionUserInfo): boolean {
  const used = (info.upload ?? 0) + (info.download ?? 0);
  return (
    (typeof info.total === "number" && Number.isFinite(info.total) && info.total > 1024) ||
    used > 1024
  );
}

function hasClearlyInvalidTrafficSnapshot(info: SubscriptionUserInfo): boolean {
  const total = info.total;
  const used = (info.upload ?? 0) + (info.download ?? 0);

  if (typeof total === "number" && Number.isFinite(total) && total > 0) {
    if (total <= 1024 && used <= 1024) return true;
    if (used > total) return true;
  }

  return false;
}

function hasUsableNodeTrafficHints(hints: SubscriptionInfoNodeHints): boolean {
  return (
    (typeof hints.totalBytes === "number" && Number.isFinite(hints.totalBytes) && hints.totalBytes > 1024) ||
    (typeof hints.usedBytes === "number" && Number.isFinite(hints.usedBytes) && hints.usedBytes > 1024) ||
    (typeof hints.remainingBytes === "number" && Number.isFinite(hints.remainingBytes) && hints.remainingBytes > 1024)
  );
}

function parseDateLikeToTimestampSeconds(value: string): number | undefined {
  const trimmed = value.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
    if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
    // 用 UTC 中午避免在不同时区格式化时出现“前一天/后一天”的漂移。
    return Math.floor(Date.UTC(year, month - 1, day, 12, 0, 0) / 1000);
  }

  const ts = Date.parse(trimmed);
  if (Number.isNaN(ts)) return undefined;
  return Math.floor(ts / 1000);
}

function extractLabeledValue(text: string, labels: string[]): string | null {
  const normalized = text.trim();

  for (const label of labels) {
    const index = normalized.indexOf(label);
    if (index < 0) continue;

    const suffix = normalized.slice(index + label.length);
    const match = /^\s*[:：]\s*(.+)$/.exec(suffix);
    if (!match) continue;

    const value = match[1]?.trim();
    if (value) return value;
  }

  return null;
}

function parseHumanReadableBytes(text: string): number | undefined {
  const match = /(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|PB)\b/i.exec(text);
  if (!match) return undefined;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) return undefined;

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const exponent = units.indexOf(match[2].toUpperCase());
  if (exponent < 0) return undefined;

  return Math.round(value * 1024 ** exponent);
}

function extractSubscriptionInfoNodeHints(nodes: ParsedNode[]): SubscriptionInfoNodeHints {
  const hints: SubscriptionInfoNodeHints = {};

  for (const node of nodes) {
    const name = typeof node?.name === "string" ? node.name.trim() : "";
    if (!name) continue;

    if (hints.remainingBytes === undefined) {
      const remaining = extractLabeledValue(name, ["剩余流量", "剩余订阅流量"]);
      const remainingBytes = remaining ? parseHumanReadableBytes(remaining) : undefined;
      if (remainingBytes !== undefined) hints.remainingBytes = remainingBytes;
    }

    if (hints.usedBytes === undefined) {
      const used = extractLabeledValue(name, ["已用流量", "已使用流量", "累计已用", "累计使用"]);
      const usedBytes = used ? parseHumanReadableBytes(used) : undefined;
      if (usedBytes !== undefined) hints.usedBytes = usedBytes;
    }

    if (hints.totalBytes === undefined) {
      const total = extractLabeledValue(name, ["总流量", "套餐流量", "流量上限", "总量"]);
      const totalBytes = total ? parseHumanReadableBytes(total) : undefined;
      if (totalBytes !== undefined) hints.totalBytes = totalBytes;
    }

    if (hints.expire === undefined) {
      const expire = extractLabeledValue(name, ["套餐到期", "订阅到期", "到期时间", "过期时间"]);
      const expireSeconds = expire ? parseDateLikeToTimestampSeconds(expire) : undefined;
      if (expireSeconds !== undefined) hints.expire = expireSeconds;
    }
  }

  return hints;
}

function buildTrafficInfoFromNodeHints(
  base: SubscriptionUserInfo,
  hints: SubscriptionInfoNodeHints
): SubscriptionUserInfo {
  const totalCandidate =
    hints.totalBytes !== undefined
      ? hints.totalBytes
      : typeof base.total === "number" && Number.isFinite(base.total) && base.total > 1024
        ? base.total
        : undefined;

  if (typeof totalCandidate === "number" && Number.isFinite(totalCandidate)) {
    if (typeof hints.usedBytes === "number" && Number.isFinite(hints.usedBytes)) {
      return {
        upload: hints.usedBytes,
        download: 0,
        total: totalCandidate,
      };
    }

    if (typeof hints.remainingBytes === "number" && Number.isFinite(hints.remainingBytes)) {
      return {
        upload: Math.max(totalCandidate - hints.remainingBytes, 0),
        download: 0,
        total: totalCandidate,
      };
    }
  }

  if (typeof hints.usedBytes === "number" && Number.isFinite(hints.usedBytes)) {
    return {
      upload: hints.usedBytes,
      download: 0,
    };
  }

  return {};
}

export function hasSubscriptionUserInfo(info: SubscriptionUserInfo | null | undefined): boolean {
  if (!info) return false;
  return (
    typeof info.upload === "number" ||
    typeof info.download === "number" ||
    typeof info.total === "number" ||
    typeof info.expire === "number"
  );
}

export function isPlausibleSubscriptionUserInfo(info: SubscriptionUserInfo | null | undefined): boolean {
  const normalized = normalizeSubscriptionUserInfo(info);
  if (isValidExpireTimestampSeconds(normalized.expire)) return true;

  const used = (normalized.upload ?? 0) + (normalized.download ?? 0);
  if (typeof normalized.total === "number" && Number.isFinite(normalized.total) && normalized.total > 1024) {
    return true;
  }
  return used > 1024;
}

export function normalizeSubscriptionUserInfo(info: SubscriptionUserInfo | null | undefined): SubscriptionUserInfo {
  if (!info) return {};

  const out: SubscriptionUserInfo = {};
  if (isFiniteNonNegativeNumber(info.upload)) out.upload = info.upload;
  if (isFiniteNonNegativeNumber(info.download)) out.download = info.download;
  if (isFiniteNonNegativeNumber(info.total)) out.total = info.total;
  const expire = normalizeExpireTimestampSeconds(info.expire);
  if (expire !== undefined) out.expire = expire;
  return out;
}

export function resolveSubscriptionUserInfo(
  info?: SubscriptionUserInfo,
  nodes: ParsedNode[] = []
): SubscriptionUserInfo {
  const normalized = normalizeSubscriptionUserInfo(info);
  const hints = extractSubscriptionInfoNodeHints(nodes);
  const trafficFromHints = buildTrafficInfoFromNodeHints(normalized, hints);

  const out: SubscriptionUserInfo = { ...normalized };

  if (hasUsableNodeTrafficHints(hints)) {
    if (!hasMeaningfulTrafficSnapshot(normalized) || hasClearlyInvalidTrafficSnapshot(normalized)) {
      delete out.upload;
      delete out.download;
      delete out.total;
      Object.assign(out, normalizeSubscriptionUserInfo(trafficFromHints));
    }
  } else if (hasClearlyInvalidTrafficSnapshot(normalized)) {
    delete out.upload;
    delete out.download;
    delete out.total;
  }

  if (!isValidExpireTimestampSeconds(out.expire) && isValidExpireTimestampSeconds(hints.expire)) {
    out.expire = hints.expire;
  }

  return out;
}

/**
 * 合并 subscription-userinfo（多订阅聚合）
 * - upload/download/total：求和
 * - expire：取最早到期（最小值）
 */
export function mergeSubscriptionUserInfo(
  target: SubscriptionUserInfo,
  patch: SubscriptionUserInfo
): SubscriptionUserInfo {
  const normalizedPatch = normalizeSubscriptionUserInfo(patch);

  if (isFiniteNonNegativeNumber(normalizedPatch.upload)) {
    target.upload = (target.upload ?? 0) + normalizedPatch.upload;
  }
  if (isFiniteNonNegativeNumber(normalizedPatch.download)) {
    target.download = (target.download ?? 0) + normalizedPatch.download;
  }
  if (isFiniteNonNegativeNumber(normalizedPatch.total)) {
    target.total = (target.total ?? 0) + normalizedPatch.total;
  }
  if (isValidExpireTimestampSeconds(normalizedPatch.expire)) {
    target.expire =
      typeof target.expire === "number" && Number.isFinite(target.expire)
        ? Math.min(target.expire, normalizedPatch.expire)
        : normalizedPatch.expire;
  }

  return target;
}
