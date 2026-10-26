import type { CustomRule, CustomRuleSet, RuleSetMetadata } from "@subboost/core/types/config";
import { isCustomRuleType } from "./custom-rule-utils";
import { isLogicRuleType, normalizeCustomRuleValue } from "./custom-rule-value";
import { getSourceIpRuleType, hasCommaPayload, supportsNoResolve } from "./custom-rule-types";
import { allocateRuleSetId, parseManualRuleSetUrl, parseRuleSetUrl } from "./rule-model";

type ImportRule = Omit<CustomRule, "type"> & { type: CustomRule["type"] | "RULE-SET" };

export type CustomRuleBatchImportPreviewStatus =
  | "ready"
  | "skipped"
  | "error"
  | "duplicate";

export type CustomRuleBatchImportPreviewItem = {
  lineNumber: number;
  raw: string;
  status: CustomRuleBatchImportPreviewStatus;
  message: string;
  rule?: ImportRule;
};

export type ParseCustomRuleBatchImportOptions = {
  text: string;
  defaultType: ImportRule["type"];
  defaultTarget: string;
  defaultNoResolve: boolean;
  targetOptions: string[];
  ruleSetTargetOptions?: string[];
  existingRules: CustomRule[];
  existingRuleSets?: CustomRuleSet[];
  reservedRuleSetIds?: string[];
  allowRemoteRuleSets?: boolean;
  resolvedRuleSets?: ReadonlyMap<string, RuleSetMetadata>;
};

export type CustomRuleBatchImportResult = {
  rules: CustomRule[];
  ruleSets: CustomRuleSet[];
  pendingRuleSetUrls: string[];
  items: CustomRuleBatchImportPreviewItem[];
  readyCount: number;
  skippedCount: number;
  errorCount: number;
  duplicateCount: number;
  canImport: boolean;
};

type SplitLineResult =
  | { ok: true; parts: string[] }
  | { ok: false; error: string };

function splitRuleLine(rawLine: string): SplitLineResult {
  const parts: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < rawLine.length; index += 1) {
    const char = rawLine[index];
    if (char === "\"" && (quoted || !current.trim())) {
      if (quoted && rawLine[index + 1] === "\"") {
        current += "\"";
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (quoted) {
    return { ok: false, error: "引号未闭合" };
  }

  parts.push(current.trim());
  return { ok: true, parts };
}

/** Unquoted regex lines protect regexp2 structure when inferring an omitted
 * policy. Literal ambiguous commas use explicit CSV fields. */
function splitCommaPayloadLine(rawLine: string, type: string): SplitLineResult {
  const firstComma = rawLine.indexOf(",");
  const payload = rawLine.slice(firstComma + 1).trim();
  const logic = isLogicRuleType(type);
  const lastComma = payload.lastIndexOf(",");
  let depth = 0;
  let classStart = -1;
  let posixClass = false;
  let extended = false;
  const extendedScopes: boolean[] = [];
  let separator = -1;
  // The final policy name may itself contain regex metacharacters. Only scan
  // as far as the last possible separator, never through that policy field.
  for (let index = 0; index <= lastComma; index += 1) {
    const char = payload[index];
    if (!logic) {
      if (char === "\\") { index += 1; continue; }
      if (classStart >= 0) {
        // POSIX [:name:] / [:^name:] belongs to the surrounding character
        // class; its closing bracket must not expose that class's commas.
        if (posixClass) {
          if (char === ":" && payload[index + 1] === "]") { posixClass = false; index += 1; }
          continue;
        }
        if (char === "[" && payload[index + 1] === ":") { posixClass = true; index += 1; continue; }
        if (char === "]" && index > classStart + 1 && !(index === classStart + 2 && payload[classStart + 1] === "^")) classStart = -1;
        continue;
      }
      // regexp2 syntax/parser.go scanBlank: block comments end at the first
      // ')' even after a backslash; none of their contents change regex state.
      if (payload.startsWith("(?#", index)) {
        const end = payload.indexOf(")", index + 3);
        if (end < 0) return { ok: false, error: "正则注释未闭合" };
        index = end;
        continue;
      }
      if (extended && char === "#") {
        // Import rows cannot contain a newline. The remaining regex is a
        // comment, but Mihomo still takes the last CSV column as the policy.
        separator = lastComma;
        break;
      }
      if (char === "[") { classStart = index; continue; }
      if (char === "(" && payload[index + 1] === "?") {
        // Only x changes delimiter scanning. Other inline options are consumed
        // using regexp2's case-insensitive option alphabet and +/- semantics.
        let end = index + 2;
        let optionX: boolean = extended;
        let enabled = true;
        for (; end < payload.length; end += 1) {
          const option = payload[end].toLowerCase();
          if (option === "+" || option === "-") enabled = option === "+";
          else if ("imnsxdu".includes(option)) {
            if (option === "x") optionX = enabled;
          } else break;
        }
        if (payload[end] === ")") {
          extended = optionX;
          index = end;
          continue;
        }
        if (payload[end] === ":") {
          extendedScopes.push(extended);
          extended = optionX;
          depth += 1;
          index = end;
          continue;
        }
      }
      if (char === "{") {
        let end = index + 1;
        while (end < payload.length && payload[end] >= "0" && payload[end] <= "9") end += 1;
        if (end > index + 1) {
          if (payload[end] === ",") {
            end += 1;
            while (end < payload.length && payload[end] >= "0" && payload[end] <= "9") end += 1;
          }
          if (payload[end] === "}") { index = end; continue; }
        }
      }
    }
    if (char === "(") {
      depth += 1;
      if (!logic) extendedScopes.push(extended);
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      if (!logic) extended = extendedScopes.pop() ?? extended;
    }
    if (char === "," && depth === 0) separator = index;
  }
  return { ok: true, parts: separator < 0
    ? [type, payload]
    : [type, payload.slice(0, separator).trim(), payload.slice(separator + 1).trim()] };
}

function isCommentLine(value: string): boolean {
  return value.startsWith("#") || value.startsWith("//");
}

function normalizeImportLine(value: string): { skip?: string; line?: string } {
  if (/^rules\s*:\s*$/i.test(value)) {
    return { skip: "rules 块标记" };
  }

  const yamlListMatch = value.match(/^-\s*(.*)$/);
  if (yamlListMatch) {
    const line = (yamlListMatch[1] ?? "").trim();
    if (!line) return { skip: "空 YAML 列表项" };
    return { line };
  }

  return { line: value };
}

function getTargetKey(target: CustomRule["target"]): string {
  if (typeof target === "string") return target.trim();
  return `${target.kind}:${target.id.trim()}`;
}

function getRuleKey(rule: Pick<ImportRule, "type" | "value" | "target" | "noResolve">): string {
  return [
    rule.type,
    rule.value.trim(),
    getTargetKey(rule.target),
    Boolean(rule.noResolve) && supportsNoResolve(rule.type) ? "1" : "0",
  ].join("\u0000");
}

function buildRuleFromParts(
  parts: string[],
  options: ParseCustomRuleBatchImportOptions,
): Pick<ImportRule, "type" | "value" | "target" | "noResolve"> | string {
  if (parts.length === 0) return "规则为空";

  const first = parts[0]?.trim() ?? "";
  if (!first) return "规则为空";

  if (parts.length === 1) {
    return {
      type: options.defaultType,
      value: first,
      target: options.defaultTarget.trim(),
      noResolve: Boolean(options.defaultNoResolve),
    };
  }

  const type = first.toUpperCase();
  if (!isCustomRuleType(type) && type !== "RULE-SET") {
    return `未知规则类型：${first}`;
  }

  // Like Mihomo ParseRulePayload: regex/logic payloads consume every comma
  // before the final target. They never take trailing parameters.
  if (hasCommaPayload(type)) {
    const hasTarget = parts.length >= 3;
    return {
      type,
      value: parts.slice(1, hasTarget ? -1 : undefined).join(","),
      target: (hasTarget ? parts.at(-1)?.trim() : "") || options.defaultTarget.trim(),
      noResolve: false,
    };
  }

  const sourceType = getSourceIpRuleType(type);
  const params = parts.slice(3);
  // Mihomo ParseParams compares these strings case-sensitively. Reject typos
  // rather than silently changing source matching or DNS resolution behavior.
  const caseVariant = params.find((param) => param !== "src" && param !== "no-resolve" && ["src", "no-resolve"].includes(param.toLowerCase()));
  if (caseVariant !== undefined) {
    return `参数区分大小写：${caseVariant}（请使用 ${caseVariant.toLowerCase()}）`;
  }
  if (parts.length > 4 && (!sourceType || !params.includes("src") || params.some((param) => param !== "no-resolve" && param !== "src"))) {
    return "规则列数过多";
  }

  const value = parts[1]?.trim() ?? "";
  const target = parts[2]?.trim() || options.defaultTarget.trim();
  const noResolve =
    parts.length >= 4
      ? params.includes("no-resolve")
      : parts[2]?.trim()
        ? false
        : Boolean(options.defaultNoResolve);

  const invalidParam = params.find((param) => param !== "no-resolve" && !(param === "src" && sourceType));
  if (invalidParam !== undefined) {
    return `不支持的尾列：${invalidParam}`;
  }

  return {
    type: params.includes("src") && sourceType ? sourceType : type,
    value,
    target,
    noResolve: params.includes("src") ? false : noResolve,
  };
}

export function parseCustomRuleBatchImport(
  options: ParseCustomRuleBatchImportOptions,
): CustomRuleBatchImportResult {
  const targetSet = new Set(
    options.targetOptions
      .map((target) => target.trim())
      .filter(Boolean),
  );
  const existingKeys = new Set(options.existingRules.map((rule) => getRuleKey(rule)));
  for (const rule of options.existingRuleSets ?? []) {
    existingKeys.add(getRuleKey({ type: "RULE-SET", value: rule.path, target: rule.target, noResolve: rule.noResolve }));
  }
  const usedIds = new Set([...(options.reservedRuleSetIds ?? []), ...(options.existingRuleSets ?? []).map((rule) => rule.id)]);
  const batchKeys = new Set<string>();
  const items: CustomRuleBatchImportPreviewItem[] = [];
  const rules: CustomRule[] = [];
  const ruleSets: CustomRuleSet[] = [];
  const pendingRuleSetUrls: string[] = [];
  let skippedCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;

  const lines = options.text.replace(/\r\n/g, "\n").split("\n");
  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed) {
      skippedCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "skipped",
        message: "空行",
      });
      return;
    }

    if (isCommentLine(trimmed)) {
      skippedCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "skipped",
        message: "注释",
      });
      return;
    }

    const normalized = normalizeImportLine(trimmed);
    if (normalized.skip) {
      skippedCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "skipped",
        message: normalized.skip,
      });
      return;
    }

    const line = normalized.line ?? trimmed;
    if (isCommentLine(line)) {
      skippedCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "skipped",
        message: "注释",
      });
      return;
    }

    const commaIndex = line.indexOf(",");
    const rawPrefix = commaIndex < 0 ? "" : line.slice(0, commaIndex).trim();
    const prefix = (rawPrefix.startsWith('"') && rawPrefix.endsWith('"') ? rawPrefix.slice(1, -1) : rawPrefix).toUpperCase();
    const plainCommaPayload = hasCommaPayload(options.defaultType) && !isCustomRuleType(prefix) && prefix !== "RULE-SET";
    const split = plainCommaPayload
      ? { ok: true as const, parts: [line] }
      : hasCommaPayload(prefix) && !rawPrefix.startsWith('"')
        ? splitCommaPayloadLine(line, prefix)
        : splitRuleLine(line);
    if (!split.ok) {
      errorCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "error",
        message: split.error,
      });
      return;
    }

    const draft = buildRuleFromParts(split.parts, options);
    if (typeof draft === "string") {
      errorCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "error",
        message: draft,
      });
      return;
    }

    const draftValue = draft.type === "RULE-SET"
      ? { ok: Boolean(draft.value.trim()), value: draft.value.trim(), error: "规则值不能为空" }
      : normalizeCustomRuleValue(draft.type, draft.value);
    if (!draftValue.ok) {
      errorCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "error",
        message: draftValue.error,
      });
      return;
    }

    const target = getTargetKey(draft.target);
    if (!target) {
      errorCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "error",
        message: "目标不能为空",
      });
      return;
    }

    if (!targetSet.has(target)) {
      errorCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "error",
        message: `未知目标：${target}`,
      });
      return;
    }

    let ruleSet: CustomRuleSet | undefined;
    if (draft.type === "RULE-SET") {
      try {
        if (["DIRECT", "REJECT"].includes(target)) throw new Error("请选择规则集使用的代理组");
        if (options.ruleSetTargetOptions && !options.ruleSetTargetOptions.includes(target)) throw new Error(`未知规则集目标：${target}`);
        const parsed = parseRuleSetUrl(draft.value);
        const metadata = options.resolvedRuleSets?.get(parsed.path) ??
          (options.allowRemoteRuleSets && !/\.mrs$/i.test(parsed.pathname) ? null : parseManualRuleSetUrl(draft.value));
        if (metadata) {
          const id = allocateRuleSetId(metadata.name, usedIds);
          ruleSet = { ...metadata, id, name: id, target, noResolve: Boolean(draft.noResolve) };
        }
      } catch (error) {
        errorCount += 1;
        items.push({ lineNumber, raw: rawLine, status: "error", message: error instanceof Error ? error.message : "规则集链接无效" });
        return;
      }
    }
    const rule: ImportRule = {
      id: "",
      type: draft.type,
      value: draftValue.value,
      target,
      noResolve: Boolean(draft.noResolve) && supportsNoResolve(draft.type),
    };
    const key = getRuleKey(rule);
    if (existingKeys.has(key) || batchKeys.has(key)) {
      duplicateCount += 1;
      items.push({
        lineNumber,
        raw: rawLine,
        status: "duplicate",
        message: existingKeys.has(key) ? "与现有规则重复" : "与本次导入的规则重复",
        rule,
      });
      return;
    }

    batchKeys.add(key);
    if (ruleSet) {
      usedIds.add(ruleSet.id);
      ruleSets.push(ruleSet);
    } else if (rule.type !== "RULE-SET") {
      rules.push({ ...rule, type: rule.type });
    } else {
      pendingRuleSetUrls.push(rule.value);
    }
    items.push({
      lineNumber,
      raw: rawLine,
      status: "ready",
      message: "可导入",
      rule,
    });
  });

  return {
    rules,
    ruleSets,
    pendingRuleSetUrls,
    items,
    readyCount: rules.length + ruleSets.length + pendingRuleSetUrls.length,
    skippedCount,
    errorCount,
    duplicateCount,
    canImport: rules.length + ruleSets.length + pendingRuleSetUrls.length > 0 && errorCount === 0 && duplicateCount === 0,
  };
}
