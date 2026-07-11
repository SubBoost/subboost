import { parseClashYaml } from "./clash-yaml";
import { looksLikeConfigLine, parseConfigLine } from "./config-line-parser";
import { parsePlatformConfigContent, looksLikePlatformConfigContent } from "./platform/parse-platform-config";
import { parsePlatformProxyLine } from "./platform/parse-platform-proxy-line";
import { parseNodeLink } from "./parse-node-link";
import type { ParseResult } from "@subboost/core/types/node";

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
  const reason = error instanceof Error ? error.message : "未知错误";
  return `解析失败: ${segment.substring(0, 50)}... - ${reason}`;
}

export function splitNodeLinkSegments(content: string): string[] {
  const lines = content.split(/[\r\n]+/).filter((line) => line.trim());
  const segments: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    if (!trimmedLine.includes("|")) {
      segments.push(trimmedLine);
      continue;
    }

    const candidates = trimmedLine
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
    if (candidates.length <= 1) {
      segments.push(trimmedLine);
      continue;
    }

    const isLinkLike = (value: string) => /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value);
    if (candidates.every(isLinkLike)) {
      segments.push(...candidates);
      continue;
    }

    segments.push(trimmedLine);
  }

  return segments;
}

function looksLikeInlineFlowProxyList(content: string): boolean {
  let hasItem = false;
  let hasType = false;
  let hasServer = false;
  let hasPort = false;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (!trimmed.startsWith("- {")) return false;

    hasItem = true;
    hasType ||= trimmed.includes("type:");
    hasServer ||= trimmed.includes("server:");
    hasPort ||= trimmed.includes("port:") || trimmed.includes("ports:");
  }

  return hasItem && hasType && hasServer && hasPort;
}

export function isClashYamlContent(content: string): boolean {
  if (
    content.includes("proxies:") ||
    content.includes("proxy-groups:") ||
    content.includes("proxy-providers:")
  ) {
    return true;
  }

  if (looksLikeInlineFlowProxyList(content)) return true;

  const hasType = /(^|\n)\s*(?:-\s*)?type\s*:\s*\S+/i.test(content);
  const hasServer = /(^|\n)\s*(?:-\s*)?server\s*:\s*\S+/i.test(content);
  const hasPort = /(^|\n)\s*(?:-\s*)?port\s*:\s*\d+/i.test(content);
  const hasPorts = /(^|\n)\s*(?:-\s*)?ports\s*:\s*\S+/i.test(content);
  return hasType && hasServer && (hasPort || hasPorts);
}

export function parseLineBasedSubscriptionContent(content: string): ParseResult {
  const nodes: ParseResult["nodes"] = [];
  const errors: string[] = [];

  for (const segment of splitNodeLinkSegments(content)) {
    if (!segment || segment.startsWith("#")) continue;

    try {
      const node = parseNodeLink(segment);
      if (node) nodes.push(node);
    } catch (error) {
      errors.push(formatParseSegmentError(segment, error));
    }
  }

  return buildParseResult(nodes, errors);
}

export function parseConfigLineSubscriptionContent(content: string): ParseResult {
  const nodes: ParseResult["nodes"] = [];
  const errors: string[] = [];

  for (const rawLine of content.split(/[\r\n]+/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;

    try {
      const platformNode = parsePlatformProxyLine(line);
      if (platformNode) {
        nodes.push(platformNode);
        continue;
      }
    } catch (error) {
      errors.push(formatParseSegmentError(line, error));
      continue;
    }

    try {
      const node = parseConfigLine(line);
      if (node) nodes.push(node);
    } catch (error) {
      errors.push(formatParseSegmentError(line, error));
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
    test: (content) => looksLikePlatformConfigContent(content),
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
  const accumulatedErrors: string[] = [];

  for (const parser of CONTENT_PARSERS) {
    if (!parser.test(content)) continue;

    try {
      const result = parser.parse(content);
      if (parser.name === "link-lines") {
        return buildParseResult(result.nodes, [...accumulatedErrors, ...result.errors]);
      }
      return result;
    } catch (error) {
      if (parser.name === "clash-yaml") {
        accumulatedErrors.push(`Clash YAML 解析失败: ${error instanceof Error ? error.message : "未知错误"}`);
        continue;
      }
      throw error;
    }
  }

  return buildParseResult([], accumulatedErrors);
}


