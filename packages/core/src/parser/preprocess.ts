import { decodeBase64, encodeBase64 } from "./base64";
import { tryParseJson } from "../json";
import { looksLikePlatformConfigContent } from "./platform/parse-platform-config";
import { isClashYamlContent } from "./content-parsers";
import { addSubscriptionError, boundSubscriptionError, checkSubscriptionInput, checkSubscriptionItems, MAX_SUBSCRIPTION_OUTPUT_LENGTH, SubscriptionParseLimitError } from "./limits";

export interface PreprocessSubscriptionContentResult {
  content: string;
  errors: string[];
  applied: string[];
}

interface SubscriptionPreprocessor {
  name: string;
  test: (content: string) => boolean;
  parse: (content: string) => { content?: string; error?: string };
}

function mergeUniqueErrors(errors: string[]): string[] {
  return Array.from(
    new Set(errors.filter((item) => typeof item === "string" && item.trim()).map((item) => boundSubscriptionError(item.trim())))
  );
}

function safeDecodeURIComponentValue(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function looksLikeHtmlContent(content: string): boolean {
  const text = content.trim();
  if (!text) return false;

  if (/^<!doctype html/i.test(text) || /^<html[\s>]/i.test(text)) return true;
  if (text.includes("<head") && text.includes("<body")) return true;
  return false;
}

function tryDecodeBase64Text(content: string): string | null {
  const normalized = content.replace(/\s/g, "");
  if (!normalized || !/^[A-Za-z0-9+/=_-]+$/.test(normalized)) {
    return null;
  }

  try {
    const decoded = decodeBase64(content);
    if (!decoded || /[\x00-\x08\x0E-\x1F]/.test(decoded)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function utf8Length(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charCodeAt(index);
    if (char < 0x80) bytes += 1;
    else if (char < 0x800) bytes += 2;
    else if (char >= 0xd800 && char <= 0xdbff && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

function checkOutputLength(used: number, next: number): void {
  if (used + next > MAX_SUBSCRIPTION_OUTPUT_LENGTH) {
    throw new SubscriptionParseLimitError("预处理展开后的内容超过大小上限");
  }
}

function* serverEntries(value: unknown): Generator<[number, unknown]> {
  if (!value || typeof value !== "object") return;
  let index = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    checkSubscriptionItems(index + 1);
    yield [index++, (value as Record<string, unknown>)[key]];
  }
}

function convertSsdSubscriptionToLinks(content: string): { content?: string; error?: string } {
  const raw = content.trim();
  if (!/^ssd:\/\//i.test(raw)) {
    return { error: "不是 SSD 订阅" };
  }

  try {
    const decoded = decodeBase64(raw.slice(6));
    const parsedJson = tryParseJson<{
      airport?: unknown;
      port?: unknown;
      encryption?: unknown;
      password?: unknown;
      servers?: unknown;
    }>(decoded);
    if (!parsedJson.ok) throw parsedJson.error;
    const parsed = parsedJson.value;

    const defaultPort = Number(parsed.port);
    const defaultMethod = typeof parsed.encryption === "string" ? parsed.encryption.trim() : "";
    const defaultPassword = typeof parsed.password === "string" ? parsed.password : "";

    const links: string[] = [];
    let outputLength = 0;
    for (const [index, entry] of serverEntries(parsed.servers)) {
      if (!entry || typeof entry !== "object") continue;
      const server = entry as Record<string, unknown>;
      const host = typeof server.server === "string" ? server.server.trim() : "";
      const port = Number(server.port ?? defaultPort);
      const method = typeof server.encryption === "string" ? server.encryption.trim() : defaultMethod;
      const password = typeof server.password === "string" ? server.password : defaultPassword;
      if (!host || !Number.isFinite(port) || port < 1 || port > 65535 || !method || !password) continue;

      const tagRaw =
        typeof server.remarks === "string" && server.remarks.trim()
          ? server.remarks.trim()
          : typeof parsed.airport === "string" && parsed.airport.trim()
            ? `${parsed.airport.trim()}-${index + 1}`
            : `SSD-${index + 1}`;
      const tag = safeDecodeURIComponentValue(tagRaw);
      const pluginName = typeof server.plugin === "string" ? server.plugin.trim() : "";
      const pluginOpts = typeof server.plugin_options === "string" ? server.plugin_options.trim() : "";
      const authBytes = utf8Length(method) + 1 + utf8Length(password);
      const estimate = 16 + Math.ceil(authBytes / 3) * 4 + host.length + String(port).length +
        3 * (utf8Length(pluginName) + utf8Length(pluginOpts) + utf8Length(tag) + 1);
      checkOutputLength(outputLength, estimate);
      const userInfo = encodeBase64(`${method}:${password}`);
      const plugin =
        pluginName && pluginOpts
          ? `/?plugin=${encodeURIComponent(`${pluginName};${pluginOpts}`)}`
          : pluginName
            ? `/?plugin=${encodeURIComponent(pluginName)}`
            : "";

      const link = `ss://${userInfo}@${host}:${port}${plugin}#${encodeURIComponent(tag)}`;
      outputLength += link.length + 1;
      links.push(link);
    }

    if (links.length === 0) {
      return { error: "SSD 订阅中未找到可转换的服务器条目" };
    }

    return { content: links.join("\n") };
  } catch (error) {
    if (error instanceof SubscriptionParseLimitError) throw error;
    return { error: error instanceof Error ? error.message : "SSD 订阅解析失败" };
  }
}

function looksLikeNetchConfigContent(content: string): boolean {
  const text = content.trim();
  if (!text.startsWith("{") || !text.includes("Server")) return false;
  // Netch 配置常见字段：ModeFileNameType / Server
  if (text.includes("ModeFileNameType")) return true;
  if (/"Server"\s*:\s*\[/.test(text)) return true;
  return false;
}

function convertNetchConfigToLinks(content: string): { content?: string; error?: string } {
  const raw = content.trim();
  if (!looksLikeNetchConfigContent(raw)) {
    return { error: "不是 Netch 配置" };
  }

  try {
    const parsedJson = tryParseJson<Record<string, unknown>>(raw);
    if (!parsedJson.ok) throw parsedJson.error;
    const parsed = parsedJson.value;
    const servers = Array.isArray(parsed.Server) ? parsed.Server : null;
    if (!servers) {
      return { error: "Netch 配置缺少 Server 列表" };
    }

    const links: string[] = [];
    let outputLength = 0;
    for (const [, entry] of serverEntries(servers)) {
      if (!entry) continue;
      const obj =
        typeof entry === "string"
          ? (() => {
              const decoded = tryParseJson<unknown>(entry);
              return decoded.ok && decoded.value && typeof decoded.value === "object" ? decoded.value : null;
            })()
          : typeof entry === "object"
            ? entry
            : null;
      if (!obj) continue;
      const json = JSON.stringify(obj);
      checkOutputLength(outputLength, 9 + Math.ceil(utf8Length(json) / 3) * 4);
      const link = `netch://${encodeBase64(json)}`;
      outputLength += link.length + 1;
      links.push(link);
    }

    if (links.length === 0) {
      return { error: "Netch 配置中未找到可转换的服务器条目" };
    }

    return { content: links.join("\n") };
  } catch (error) {
    if (error instanceof SubscriptionParseLimitError) throw error;
    return { error: error instanceof Error ? error.message : "Netch 配置解析失败" };
  }
}

function extractFullConfigProxySection(content: string): { content?: string; error?: string } {
  const lines = content.split(/\r?\n/);
  const sections: Array<{ name: string; lines: string[] }> = [];
  let currentName = "";
  let currentLines: string[] = [];

  const flush = () => {
    if (currentName) {
      sections.push({ name: currentName, lines: [...currentLines] });
    }
    currentLines = [];
  };

  for (const rawLine of lines) {
    const match = rawLine.trim().match(/^\[(.+)\]$/);
    if (match) {
      flush();
      currentName = match[1].trim();
      continue;
    }
    if (currentName) currentLines.push(rawLine);
  }
  flush();

  const included = sections.filter((section) => /^(server_local|server_remote|proxy)$/i.test(section.name) || /^wireguard\s+/i.test(section.name));
  if (included.length === 0) {
    return { error: "未找到可提取的代理配置段" };
  }

  const output = included
    .map((section) => [`[${section.name}]`, ...section.lines].join("\n").trimEnd())
    .join("\n\n")
    .trim();

  if (!output) {
    return { error: "未找到可提取的代理配置段" };
  }
  return { content: output };
}

const SUBSCRIPTION_PREPROCESSORS: SubscriptionPreprocessor[] = [
  {
    name: "html",
    test: (content) => looksLikeHtmlContent(content),
    parse: () => ({ error: "检测到 HTML 页面内容，疑似错误页或拦截页，已停止解析" }),
  },
  {
    name: "base64",
    test: (content) => Boolean(tryDecodeBase64Text(content)),
    parse: (content) => {
      const decoded = tryDecodeBase64Text(content);
      return decoded ? { content: decoded.trim() } : { error: "Base64 预处理失败" };
    },
  },
  {
    name: "ssd",
    test: (content) => /^ssd:\/\//i.test(content.trim()),
    parse: (content) => convertSsdSubscriptionToLinks(content),
  },
  {
    name: "netch-json",
    test: (content) => looksLikeNetchConfigContent(content),
    parse: (content) => convertNetchConfigToLinks(content),
  },
  {
    name: "full-config",
    test: (content) => !isClashYamlContent(content) && looksLikePlatformConfigContent(content),
    parse: (content) => extractFullConfigProxySection(content),
  },
];

function preprocess(content: string): PreprocessSubscriptionContentResult {
  checkSubscriptionInput(content);
  let current = content.trim();
  const errors: string[] = [];
  const applied: string[] = [];

  for (let pass = 0; pass < 3; pass += 1) {
    if (!current) break;

    const matched = SUBSCRIPTION_PREPROCESSORS.find((preprocessor) => preprocessor.test(current));
    if (!matched) {
      break;
    }

    const next = matched.parse(current);
    if (!next.content) {
      addSubscriptionError(errors,
        matched.name === "ssd"
          ? `SSD 订阅预处理失败: ${boundSubscriptionError(next.error || "未知错误")}`
          : next.error || `${matched.name} 预处理失败`
      );
      return { content: "", errors: mergeUniqueErrors(errors), applied };
    }

    const normalizedNext = next.content.trim();
    checkOutputLength(0, normalizedNext.length);
    if (!normalizedNext || normalizedNext === current) {
      break;
    }

    current = normalizedNext;
    applied.push(matched.name);
    continue;

  }

  return {
    content: current,
    errors: mergeUniqueErrors(errors),
    applied,
  };
}

export function preprocessSubscriptionContent(content: string): PreprocessSubscriptionContentResult {
  try {
    return preprocess(content);
  } catch (error) {
    if (error instanceof SubscriptionParseLimitError) return { content: "", errors: [error.message], applied: [] };
    throw error;
  }
}

