"use client";

import * as React from "react";
import { Button } from "@subboost/ui/components/ui/button";
import { cn } from "@subboost/ui/lib/utils";

/**
 * YAML 语法高亮（简单版本）
 */
type YamlRenderMode = "highlight" | "plain";

const YAML_RENDER_LIMITS = {
  lineCount: 2500,
  charCount: 300000,
  longestLine: 4000,
} as const;

type YamlRenderStats = {
  lineCount: number;
  charCount: number;
  longestLine: number;
  shouldUsePlain: boolean;
};

function analyzeYamlRenderStats(content: string): YamlRenderStats {
  const charCount = content.length;
  if (!content) {
    return {
      lineCount: 0,
      charCount: 0,
      longestLine: 0,
      shouldUsePlain: false,
    };
  }

  let lineCount = 1;
  let longestLine = 0;
  let currentLineLength = 0;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content.charCodeAt(i);
    if (ch === 10) {
      if (currentLineLength > longestLine) longestLine = currentLineLength;
      currentLineLength = 0;
      lineCount += 1;
      continue;
    }
    if (ch !== 13) currentLineLength += 1;
  }

  if (currentLineLength > longestLine) longestLine = currentLineLength;

  const shouldUsePlain =
    lineCount > YAML_RENDER_LIMITS.lineCount ||
    charCount > YAML_RENDER_LIMITS.charCount ||
    longestLine > YAML_RENDER_LIMITS.longestLine;

  return { lineCount, charCount, longestLine, shouldUsePlain };
}

export function YamlHighlight({ content, className }: { content: string; className?: string }) {
  const [forceHighlight, setForceHighlight] = React.useState(false);

  const renderStats = React.useMemo(() => analyzeYamlRenderStats(content), [content]);

  React.useEffect(() => {
    setForceHighlight(false);
  }, [content]);

  const renderMode: YamlRenderMode =
    renderStats.shouldUsePlain && !forceHighlight ? "plain" : "highlight";

  const highlightedLines = React.useMemo(() => {
    if (renderMode !== "highlight") return [];
    return content.split("\n").map((line, idx) => ({
      number: idx + 1,
      html: highlightYamlLine(line),
    }));
  }, [content, renderMode]);

  return (
    <div className={cn("overflow-auto", className)}>
      {renderStats.shouldUsePlain && (
        <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          <div className="flex items-center justify-between gap-2">
            <span>
              YAML 内容较大，已切换纯文本模式以避免卡顿
              {!forceHighlight &&
                `（${renderStats.lineCount} 行 / ${renderStats.charCount} 字符）`}
            </span>
            {forceHighlight ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForceHighlight(false)}
                className="h-auto rounded border-amber-300/40 px-2 py-0.5 text-[10px] text-amber-100 hover:bg-amber-300/10"
              >
                恢复纯文本
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForceHighlight(true)}
                className="h-auto rounded border-amber-300/40 px-2 py-0.5 text-[10px] text-amber-100 hover:bg-amber-300/10"
              >
                强制语法高亮
              </Button>
            )}
          </div>
        </div>
      )}

      {renderMode === "plain" ? (
        <pre className="px-3 py-2 text-xs font-mono whitespace-pre text-slate-200">{content}</pre>
      ) : (
        <pre className="text-xs font-mono">
          {highlightedLines.map(({ number, html }) => (
            <div key={number} className="flex hover:bg-white/5">
              <span className="w-10 px-2 py-0.5 text-right text-white/50 select-none border-r border-white/10 flex-shrink-0">
                {number}
              </span>
              <span
                className="flex-1 px-3 py-0.5 whitespace-pre text-slate-200"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          ))}
        </pre>
      )}
    </div>
  );
}

/**
 * 高亮单行 YAML
 */
function highlightYamlLine(line: string): string {
  // 注释
  if (line.trim().startsWith("#")) {
    return `<span class="text-white/50">${escapeHtml(line)}</span>`;
  }

  // 空行
  if (!line.trim()) {
    return line;
  }

  // 数组项（必须在键值对之前检测，否则 `- {name: xxx}` 会被当作键值对）
  const arrayMatch = line.match(/^(\s*)(-)(\s+)(.*)$/);
  if (arrayMatch) {
    const [, indent, dash, space, value] = arrayMatch;
    const trimmedValue = value.trim();
    const highlightedValue = highlightYamlValue(trimmedValue);
    return `${escapeHtml(indent)}<span class="text-yellow-400">${dash}</span>${escapeHtml(space)}${highlightedValue}`;
  }

  // 键值对
  const keyMatch = line.match(/^(\s*)([^:]+)(:)(.*)$/);
  if (keyMatch) {
    const [, indent, key, colon, value] = keyMatch;
    const highlightedValue = highlightYamlValue(value.trim());
    return `${escapeHtml(indent)}<span class="text-cyan-400">${escapeHtml(key)}</span><span class="text-white">${colon}</span> ${highlightedValue}`;
  }

  return escapeHtml(line);
}

/**
 * 高亮 YAML 值
 */
function highlightYamlValue(value: string): string {
  if (!value) return "";

  // 内联对象 {key: value, ...}
  if (value.startsWith("{") && value.endsWith("}")) {
    return highlightInlineObject(value);
  }

  // 内联数组 [item, ...]
  if (value.startsWith("[") && value.endsWith("]")) {
    return highlightInlineArray(value);
  }

  // 字符串（带引号）
  if (/^".*"$/.test(value)) {
    return `<span class="text-green-400">${escapeHtml(value)}</span>`;
  }

  // 数字
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return `<span class="text-orange-400">${escapeHtml(value)}</span>`;
  }

  // 布尔值
  if (/^(true|false)$/i.test(value)) {
    const color = value.toLowerCase() === "true" ? "text-emerald-400" : "text-rose-400";
    return `<span class="${color}">${escapeHtml(value)}</span>`;
  }

  // null
  if (/^(null|~)$/i.test(value)) {
    return `<span class="text-red-400">${escapeHtml(value)}</span>`;
  }

  // 协议类型关键词
  if (/^(ss|ssr|vmess|vless|trojan|anytls|hysteria2|hy2|socks5|socks4|http|https|relay)$/.test(value)) {
    return `<span class="text-pink-400 font-medium">${escapeHtml(value)}</span>`;
  }

  // 特殊值关键词
  if (/^(auto|chrome|firefox|safari|edge|qq|random|tcp|ws|grpc|h2|quic)$/.test(value)) {
    return `<span class="text-sky-400">${escapeHtml(value)}</span>`;
  }

  return `<span class="text-slate-200">${escapeHtml(value)}</span>`;
}

/**
 * 高亮内联对象 {key: value, key2: value2}
 */
function highlightInlineObject(obj: string): string {
  const inner = obj.slice(1, -1);
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];

    if (!inQuote && (char === '"' || char === "'")) {
      inQuote = true;
      quoteChar = char;
      current += char;
    } else if (inQuote && char === quoteChar && inner[i - 1] !== "\\") {
      inQuote = false;
      quoteChar = "";
      current += char;
    } else if (!inQuote && (char === "{" || char === "[")) {
      depth++;
      current += char;
    } else if (!inQuote && (char === "}" || char === "]")) {
      depth--;
      current += char;
    } else if (!inQuote && char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());

  const highlighted = parts.map((part) => {
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) return highlightYamlValue(part);

    const key = part.slice(0, colonIdx).trim();
    const val = part.slice(colonIdx + 1).trim();

    let keyColor = "text-cyan-400";
    if (["name", "type", "server", "port"].includes(key)) {
      keyColor = "text-amber-400 font-medium";
    } else if (["password", "uuid", "cipher"].includes(key)) {
      keyColor = "text-violet-400";
    } else if (["tls", "sni", "servername", "skip-cert-verify", "client-fingerprint"].includes(key)) {
      keyColor = "text-teal-400";
    } else if (key === "dialer-proxy") {
      keyColor = "text-rose-400 font-medium";
    }

    return `<span class="${keyColor}">${escapeHtml(key)}</span><span class="text-white/60">:</span> ${highlightYamlValue(val)}`;
  });

  return `<span class="text-white/40">{</span>${highlighted.join(`<span class="text-white/40">,</span> `)}<span class="text-white/40">}</span>`;
}

/**
 * 高亮内联数组 [item1, item2]
 */
function highlightInlineArray(arr: string): string {
  const inner = arr.slice(1, -1);
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];

    if (!inQuote && (char === '"' || char === "'")) {
      inQuote = true;
      quoteChar = char;
      current += char;
    } else if (inQuote && char === quoteChar && inner[i - 1] !== "\\") {
      inQuote = false;
      quoteChar = "";
      current += char;
    } else if (!inQuote && (char === "{" || char === "[")) {
      depth++;
      current += char;
    } else if (!inQuote && (char === "}" || char === "]")) {
      depth--;
      current += char;
    } else if (!inQuote && char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());

  const highlighted = parts.map((part) => highlightYamlValue(part));
  return `<span class="text-white/40">[</span>${highlighted.join(`<span class="text-white/40">,</span> `)}<span class="text-white/40">]</span>`;
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
