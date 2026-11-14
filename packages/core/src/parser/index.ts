/**
 * 订阅解析引擎 - 浏览器端运行
 * 支持: Base64, SSD, Clash YAML, SS/SSR, VMess, VLESS, Trojan, AnyTLS, Hysteria2, TUIC, SOCKS, HTTP, SSH
 */

import { parseBase64 } from "./base64";
import { parseClashYaml } from "./clash-yaml";
import { parseSubscriptionContentByRegistry } from "./content-parsers";
import { normalizeParseResult } from "./normalize";
import { preprocessSubscriptionContent } from "./preprocess";
import { parseNodeLink } from "./parse-node-link";
import type { ParseResult } from "@subboost/core/types/node";
import { SubscriptionParseLimitError } from "./limits";

function finalizeParseResult(result: ParseResult, priorErrors: string[] = []): ParseResult {
  return normalizeParseResult(result, priorErrors);
}

/**
 * 自动识别并解析订阅内容
 * @param content 订阅内容（可以是 Base64、YAML、节点链接等）
 * @returns 解析结果
 */
export function parseSubscription(content: string): ParseResult {
  try {
    return parseSubscriptionInternal(content);
  } catch (error) {
    if (error instanceof SubscriptionParseLimitError) {
      return { nodes: [], errors: [error.message], totalParsed: 0, totalFailed: 1 };
    }
    throw error;
  }
}

function parseSubscriptionInternal(content: string): ParseResult {
  const preprocessed = preprocessSubscriptionContent(content);
  const trimmedContent = preprocessed.content.trim();
  const errors: string[] = [...preprocessed.errors];

  if (!trimmedContent) {
    return finalizeParseResult(
      {
        nodes: [],
        errors,
        totalParsed: 0,
        totalFailed: errors.length,
      },
      []
    );
  }
  const result = parseSubscriptionContentByRegistry(trimmedContent);
  return finalizeParseResult(result, errors);
}

export { parseBase64, parseClashYaml };
export { parseNodeLink };
export * from "./protocols/ss";
export * from "./protocols/ssr";
export * from "./protocols/vmess";
export * from "./protocols/vless";
export * from "./protocols/trojan";
export * from "./protocols/anytls";
export * from "./protocols/hysteria";
export * from "./protocols/hysteria2";
export * from "./protocols/tuic";
export * from "./protocols/simple-proxy";
export * from "./protocols/wireguard";
export * from "./protocols/snell";

