import { CORE_SCHEMA, EVENT_ID, constructFromEvents, parseEvents } from "js-yaml";
import type { RuleSetBehavior } from "../types/config";
import { isCustomRuleType } from "./custom-rule-utils";

export const RULE_CONTENT_MAX_BYTES = 10 * 1024 * 1024;
const MAX_ENTRIES = 100000;
const MAX_LINE_LENGTH = 8192;
const INVALID_CONTENT = "无法识别规则文件，请使用有效的 text 或 YAML 规则集";

function ipVersion(value: string): 0 | 4 | 6 {
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    return value.split(".").every((part) => Number(part) <= 255 && (part === "0" || !part.startsWith("0"))) ? 4 : 0;
  }
  if (!value.includes(":") || /[\[\]%/\s]/.test(value)) return 0;
  try { return new URL(`http://[${value}]/`).hostname.startsWith("[") ? 6 : 0; } catch { return 0; }
}

function validCidr(value: string, requiredVersion?: 4 | 6): boolean {
  const parts = value.split("/");
  const [address, prefix] = parts;
  const version = ipVersion(address);
  return parts.length === 2 && !!version && (!requiredVersion || requiredVersion === version) &&
    /^\d{1,3}$/.test(prefix ?? "") && Number(prefix) <= (version === 4 ? 32 : 128);
}

function validDomain(value: string, patterns = true): boolean {
  if (!value || value.length > 253 || ipVersion(value) || /^[\d.]+$/.test(value)) return false;
  const domain = patterns ? value.replace(/^(?:\+\.|\.)/, "") : value;
  return domain.split(".").every((label) =>
    !!label && label.length <= 63 && (patterns && label === "*" || /^[a-z\d_](?:[a-z\d_-]*[a-z\d_])?$/i.test(label)));
}

function validPort(value: string): boolean {
  return value.split("/").every((part) => {
    const bounds = part.split("-");
    return bounds.length <= 2 && bounds.every((bound) => /^\d{1,5}$/.test(bound) && Number(bound) <= 65535) &&
      (bounds.length === 1 || Number(bounds[0]) <= Number(bounds[1]));
  });
}

function validClassical(value: string): boolean {
  const [type, pattern, option, extra] = value.split(",").map((part) => part.trim());
  if (!isCustomRuleType(type) || !pattern || extra !== undefined) return false;
  if (option !== undefined && !(option === "no-resolve" && ["IP-CIDR", "IP-CIDR6", "GEOIP"].includes(type))) return false;
  switch (type) {
    case "DOMAIN": case "DOMAIN-SUFFIX": return validDomain(pattern, false);
    case "IP-CIDR": return validCidr(pattern, 4);
    case "IP-CIDR6": return validCidr(pattern, 6);
    case "GEOIP": case "GEOSITE": return /^[a-z\d_@!-]+$/i.test(pattern);
    case "DST-PORT": case "SRC-PORT": return validPort(pattern);
    case "DOMAIN-KEYWORD": return !/[\s/:<>\[\]{}]/.test(pattern);
    case "PROCESS-NAME": return !/[\r\n\0]/.test(pattern);
  }
  return false;
}

export function detectRuleContent(content: string): { format: "yaml" | "text"; behavior: RuleSetBehavior } {
  if (new TextEncoder().encode(content).length > RULE_CONTENT_MAX_BYTES) throw new Error("规则文件超过 10 MiB 限制");
  const text = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(text)) throw new Error(INVALID_CONTENT);
  const lines = text.split("\n");
  if (lines.some((line) => line.length > MAX_LINE_LENGTH)) throw new Error("规则文件包含过长的行");
  const meaningful = lines.map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  let entries: string[];
  let format: "yaml" | "text" = "text";
  const detectBehavior = (values: string[]): RuleSetBehavior | null =>
    values.every((entry) => validCidr(entry)) ? "ipcidr"
      : values.every((entry) => validDomain(entry)) ? "domain"
      : values.every(validClassical) ? "classical" : null;
  if (!detectBehavior(meaningful)) {
    format = "yaml";
    try {
      // Reject aliases before construction so recursive/expanding YAML cannot allocate a graph.
      const events = parseEvents(text, {});
      if (events.some((event) => event.type === EVENT_ID.ALIAS || ("anchorStart" in event && event.anchorStart >= 0)) || events.length > MAX_ENTRIES * 2 + 16) throw new Error();
      const docs = constructFromEvents(events, { source: text, schema: CORE_SCHEMA });
      const doc = docs[0];
      if (docs.length !== 1 || !doc || typeof doc !== "object" || Array.isArray(doc) ||
        Object.keys(doc).length !== 1 || !("payload" in doc) || !Array.isArray(doc.payload) ||
        !doc.payload.every((entry: unknown) => typeof entry === "string")) throw new Error();
      entries = doc.payload.map((entry: string) => entry.trim());
    } catch { throw new Error(INVALID_CONTENT); }
  } else {
    entries = meaningful;
  }
  if (!entries.length || entries.length > MAX_ENTRIES || entries.some((entry) => !entry || entry.length > MAX_LINE_LENGTH)) throw new Error(INVALID_CONTENT);
  const behavior = detectBehavior(entries);
  if (!behavior) throw new Error(INVALID_CONTENT);
  return { format, behavior };
}
