import { parseConfigLine } from "../config-line-parser";
import type { ParseResult } from "@subboost/core/types/node";
import { parsePlatformProxyLine } from "./parse-platform-proxy-line";

function buildParseResult(nodes: ParseResult["nodes"], errors: string[]): ParseResult {
  return {
    nodes,
    errors,
    totalParsed: nodes.length,
    totalFailed: errors.length,
  };
}

function formatParseSegmentError(segment: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : "未知错误";
  return `解析失败: ${segment.substring(0, 80)}... - ${reason}`;
}

function buildSectionMap(content: string): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  const lines = content.split(/\r?\n/);
  let currentSection = "";
  let currentLines: string[] = [];

  const flush = () => {
    if (currentSection) sections.set(currentSection, [...currentLines]);
    currentLines = [];
  };

  for (const rawLine of lines) {
    const sectionMatch = rawLine.trim().match(/^\[(.+)\]$/);
    if (sectionMatch) {
      flush();
      currentSection = sectionMatch[1].trim();
      continue;
    }
    if (currentSection) currentLines.push(rawLine);
  }
  flush();
  return sections;
}

function isProxySectionName(name: string): boolean {
  return /^(proxy|server_local|server_remote)$/i.test(name.trim());
}

function isPlatformDirectPolicyLine(line: string): boolean {
  return /^[^=]+=\s*direct\s*$/i.test(line.trim());
}

export function isPlatformConfigSectionHeader(line: string): boolean {
  return /^\[.+\]$/.test(line);
}

export function looksLikePlatformConfigContent(content: string): boolean {
  const lines = content.split(/[\r\n]+/).map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith(";"));
  return lines.some((line) => isPlatformConfigSectionHeader(line) &&
    /^\[[ \t]*(?:proxy|server_local|server_remote|wireguard\s+)/i.test(line));
}

export function parsePlatformConfigContent(content: string): ParseResult {
  const nodes: ParseResult["nodes"] = [];
  const errors: string[] = [];
  const sections = buildSectionMap(content);

  for (const [sectionName, sectionLines] of Array.from(sections.entries())) {
    if (!isProxySectionName(sectionName)) continue;

    for (const rawLine of sectionLines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || line.startsWith(";")) continue;
      if (isPlatformDirectPolicyLine(line)) continue;

      try {
        const platformNode = parsePlatformProxyLine(line, { sections });
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
  }

  return buildParseResult(nodes, errors);
}

