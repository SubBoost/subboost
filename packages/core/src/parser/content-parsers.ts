import { parseClashYaml } from "./clash-yaml";
import { looksLikeConfigLine, parseConfigLine } from "./config-line-parser";
import { parsePlatformConfigContent, looksLikePlatformConfigContent, isPlatformConfigSectionHeader } from "./platform/parse-platform-config";
import { parsePlatformProxyLine } from "./platform/parse-platform-proxy-line";
import { parseNodeLink } from "./parse-node-link";
import { loadSubscriptionYaml } from "./yaml-scalars";
import type { ParseResult } from "@subboost/core/types/node";
import { addSubscriptionError, checkSubscriptionInput, checkSubscriptionItems, isSubscriptionParseLimitMessage, MAX_SUBSCRIPTION_ERRORS, SubscriptionParseLimitError } from "./limits";

interface SubscriptionContentParser {
  name: string;
  test: (content: string) => boolean;
  parse: (content: string) => ParseResult;
}

function buildParseResult(nodes: ParseResult["nodes"], errors: string[]): ParseResult {
  return {
    nodes,
    errors,
    totalParsed: nodes.length,
    totalFailed: errors.length,
  };
}

export function formatParseSegmentError(segment: string, error: unknown): string {
  const reason = error instanceof Error ? error.message.slice(0, 500) : "未知错误";
  return `解析失败: ${segment.substring(0, 50)}... - ${reason}`;
}

export function splitNodeLinkSegments(content: string): string[] {
  checkSubscriptionInput(content);
  const lines = content.split(/[\r\n]+/).filter((line) => line.trim());
  const segments: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    if (!trimmedLine.includes("|")) {
      checkSubscriptionItems(segments.length + 1);
      segments.push(trimmedLine);
      continue;
    }

    let separators = 0;
    for (const char of trimmedLine) if (char === "|") checkSubscriptionItems(++separators + 1);
    const candidates = trimmedLine
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
    if (candidates.length <= 1) {
      checkSubscriptionItems(segments.length + 1);
      segments.push(trimmedLine);
      continue;
    }

    const isLinkLike = (value: string) => /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);
    if (candidates.every(isLinkLike)) {
      checkSubscriptionItems(segments.length + candidates.length);
      segments.push(...candidates);
      continue;
    }

    checkSubscriptionItems(segments.length + 1);
    segments.push(trimmedLine);
  }

  return segments;
}

function hasBlockMappingSeparator(line: string): boolean {
  for (let index = line.indexOf(":"); index >= 0; index = line.indexOf(":", index + 1)) {
    const next = line[index + 1];
    if (next === undefined || next === " " || next === "\t") return true;
  }
  return false;
}

function startsWithYamlNodeDocument(content: string): boolean {
  // Only route by root syntax. The YAML parser owns keys, fields and node validation.
  for (const line of content.split(/[\r\n]+/)) {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";") || trimmed.startsWith("%")) continue;
    if (/^---(?:[ \t]|$)/.test(trimmed)) {
      trimmed = trimmed.slice(3).trimStart();
      if (!trimmed || trimmed.startsWith("#")) continue;
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return false;
    if (isPlatformConfigSectionHeader(trimmed)) {
      // Bracketed section names overlap flow sequences; valid YAML keeps its parser.
      try {
        const root = loadSubscriptionYaml(content);
        if (!Array.isArray(root) && looksLikePlatformConfigContent(content)) return false;
      } catch (error) {
        if (error instanceof SubscriptionParseLimitError) throw error;
        if (looksLikePlatformConfigContent(content)) return false;
        try {
          const header = loadSubscriptionYaml(trimmed);
          if (Array.isArray(header) && header.length === 1 && typeof header[0] === "string") return false;
        } catch (error) {
          if (error instanceof SubscriptionParseLimitError) throw error;
          // Malformed flow sequences must reach the YAML parser's error reporting.
        }
      }
    }
    return trimmed.startsWith("{") || trimmed.startsWith("[") ||
      /^[-?](?:[ \t]|$)/.test(trimmed) || /^[!&]/.test(trimmed) || hasBlockMappingSeparator(trimmed);
  }
  return false;
}

export function isClashYamlContent(content: string): boolean {
  if (/^(?:[ \t]*)(?:proxies|proxy-groups|proxy-providers)[ \t]*:/m.test(content)) {
    return true;
  }

  return startsWithYamlNodeDocument(content);
}

export function parseLineBasedSubscriptionContent(content: string): ParseResult {
  const nodes: ParseResult["nodes"] = [];
  const errors: string[] = [];

  for (const segment of splitNodeLinkSegments(content)) {
    if (!segment || segment.startsWith("#")) continue;

    try {
      const node = parseNodeLink(segment);
      if (node) { checkSubscriptionItems(nodes.length + 1); nodes.push(node); }
    } catch (error) {
      if (error instanceof SubscriptionParseLimitError) throw error;
      addSubscriptionError(errors, formatParseSegmentError(segment, error));
    }
  }

  return buildParseResult(nodes, errors);
}

export function parseConfigLineSubscriptionContent(content: string): ParseResult {
  checkSubscriptionInput(content);
  const nodes: ParseResult["nodes"] = [];
  const errors: string[] = [];
  let count = 0;

  for (const rawLine of content.split(/[\r\n]+/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    checkSubscriptionItems(++count);

    try {
      const platformNode = parsePlatformProxyLine(line);
      if (platformNode) {
        nodes.push(platformNode);
        continue;
      }
    } catch (error) {
      if (error instanceof SubscriptionParseLimitError) throw error;
      addSubscriptionError(errors, formatParseSegmentError(line, error));
      continue;
    }

    try {
      const node = parseConfigLine(line);
      if (node) nodes.push(node);
    } catch (error) {
      if (error instanceof SubscriptionParseLimitError) throw error;
      addSubscriptionError(errors, formatParseSegmentError(line, error));
    }
  }

  return buildParseResult(nodes, errors);
}

function isConfigLineContent(content: string): boolean {
  const lines = content
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith(";"));
  const isLinkLike = (line: string) => /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(line);
  checkSubscriptionItems(lines.length);
  return lines.length > 0 && lines.every((line) => !isLinkLike(line) && looksLikeConfigLine(line));
}

const CONTENT_PARSERS: SubscriptionContentParser[] = [
  {
    name: "clash-yaml",
    test: (content) => isClashYamlContent(content),
    parse: (content) => parseClashYaml(content),
  },
  {
    name: "platform-config",
    test: (content) => !isClashYamlContent(content) && looksLikePlatformConfigContent(content),
    parse: (content) => parsePlatformConfigContent(content),
  },
  {
    name: "config-lines",
    test: (content) => isConfigLineContent(content),
    parse: (content) => parseConfigLineSubscriptionContent(content),
  },
  {
    name: "link-lines",
    test: () => true,
    parse: (content) => parseLineBasedSubscriptionContent(content),
  },
];

export function parseSubscriptionContentByRegistry(content: string): ParseResult {
  checkSubscriptionInput(content);
  const accumulatedErrors: string[] = [];

  for (const parser of CONTENT_PARSERS) {
    if (!parser.test(content)) continue;

    try {
      const result = parser.parse(content);
      if (result.errors.some(isSubscriptionParseLimitMessage)) return result;
      if (parser.name === "link-lines") {
        if (accumulatedErrors.length + result.errors.length > MAX_SUBSCRIPTION_ERRORS) {
          throw new SubscriptionParseLimitError("解析错误数量超过上限");
        }
        return buildParseResult(result.nodes, [...accumulatedErrors, ...result.errors]);
      }
      if (result.nodes.length > 0) return result;
      for (const error of result.errors) addSubscriptionError(accumulatedErrors, error);
    } catch (error) {
      if (error instanceof SubscriptionParseLimitError) {
        return buildParseResult([], [error.message]);
      }
      if (parser.name === "clash-yaml") {
        addSubscriptionError(accumulatedErrors, `Clash YAML 解析失败: ${error instanceof Error ? error.message.slice(0, 500) : "未知错误"}`);
        continue;
      }
      throw error;
    }
  }

  return buildParseResult([], accumulatedErrors);
}

