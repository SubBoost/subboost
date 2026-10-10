import { buildNodeContentKey } from "@subboost/core/node-identity";
import { isSubscriptionInfoNodeName } from "@subboost/core/subscription/info-node-name";
import type { ParsedNode, ParseResult } from "@subboost/core/types/node";
import { canonicalizeParsedNode } from "./canonical-fields";
import {
  CLIENT_UPDATE_PLACEHOLDER_ERROR,
  filterClientUpdatePlaceholderNodes,
} from "./placeholder";

export type ParseErrorCategory =
  | "empty"
  | "html"
  | "yaml"
  | "placeholder"
  | "unsupported-scheme"
  | "unsupported-format"
  | "unknown";

function mergeUniqueErrors(...parts: string[][]): string[] {
  return Array.from(
    new Set(
      parts
        .flatMap((items) => items)
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => item.trim())
    )
  );
}

export function inferParseErrorCategory(error: string): ParseErrorCategory {
  const normalized = error.trim().toLowerCase();
  if (!normalized) return "unknown";
  if (normalized.includes("不能为空") || normalized.includes("空的配置文件")) return "empty";
  if (normalized.includes("html") || normalized.includes("错误页") || normalized.includes("拦截页")) return "html";
  if (normalized.includes("yaml")) return "yaml";
  if (normalized.includes("占位") || normalized.includes("更新提示")) return "placeholder";
  if (normalized.includes("不支持的协议")) return "unsupported-scheme";
  if (normalized.includes("无法识别") || normalized.includes("格式")) return "unsupported-format";
  return "unknown";
}

export function normalizeParseErrors(errors: string[]): string[] {
  return mergeUniqueErrors(errors);
}

export function dedupeParsedNodes(nodes: ParsedNode[]): {
  nodes: ParsedNode[];
  dedupedCount: number;
} {
  const seen = new Set<string>();
  const deduped: ParsedNode[] = [];

  for (const node of nodes) {
    const key = isSubscriptionInfoNodeName(node.name)
      ? `${node.name.trim()}\u0000${buildNodeContentKey(node)}`
      : buildNodeContentKey(node);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(node);
  }

  return {
    nodes: deduped,
    dedupedCount: nodes.length - deduped.length,
  };
}

export function normalizeParseResult(result: ParseResult, priorErrors: string[] = []): ParseResult {
  const canonicalNodes = result.nodes.map((node) => canonicalizeParsedNode(node));
  const placeholderFiltered = filterClientUpdatePlaceholderNodes(canonicalNodes);
  const deduped = dedupeParsedNodes(placeholderFiltered.nodes);
  const errors = normalizeParseErrors(
    mergeUniqueErrors(
      priorErrors,
      result.errors,
      placeholderFiltered.filteredCount > 0 ? [CLIENT_UPDATE_PLACEHOLDER_ERROR] : []
    )
  );

  return {
    ...(result.sourceConfig ? { sourceConfig: result.sourceConfig } : {}),
    ...(result.resolvedHosts ? { resolvedHosts: result.resolvedHosts } : {}),
    nodes: deduped.nodes,
    errors,
    totalParsed: deduped.nodes.length,
    totalFailed: errors.length,
  };
}
