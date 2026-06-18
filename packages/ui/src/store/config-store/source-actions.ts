import type { ParsedNode, ParseResult } from "@subboost/core/types/node";
import { parseSubscription } from "@subboost/core/parser";
import { buildNodeContentKey, buildScopedNodeIdentityKey } from "@subboost/core/node-identity";
import {
  detachSourceNodesFromState,
  mergeParsedSourceNodes,
  prepareSourceParsedNodes,
} from "@subboost/core/subscription/source-node-refresh";
import {
  hasSubscriptionUserInfo,
  parseSubscriptionUserInfo,
  resolveSubscriptionUserInfo,
  type SubscriptionUserInfo,
} from "@subboost/core/subscription/subscription-userinfo";
import {
  createSubscriptionImportErrorInfo,
  inferSubscriptionImportErrorCategory,
  isSubscriptionImportError,
  maskUrlForPublicDisplay,
  sanitizePublicErrorText,
  type SubscriptionImportErrorInfo,
} from "@subboost/core/subscription/import-error";
import { stripImportedNodeControlFieldsFromList } from "@subboost/core/subscription/imported-node-controls";
import { tryNormalizeSubscriptionUrlInput } from "@subboost/core/subscription/url-input";
import type { ConfigActions, SubscriptionSource } from "./definitions";
import {
  fetchUrlContentInBrowser,
  getNodeSourceIds,
  ORIGIN_NAME_KEY,
  SOURCE_IDS_KEY,
  withNodeSourceId,
  withoutNodeSourceIds,
  withUniqueNodeNames,
} from "./definitions";
import type { GetState, SetAndGenerateConfig, SetState, StoreState } from "./store-types";

type SourceActions = Pick<
  ConfigActions,
  "setSources" | "parseContent" | "parseSingleSource" | "parseMultipleSources"
>;

function pickUrlFetchParseResult(fetched: Awaited<ReturnType<typeof fetchUrlContentInBrowser>>): ParseResult | null {
  return fetched.parseResult ?? null;
}

const DEFAULT_PARSE_FAILURE_MESSAGE = "解析失败";

function toSubscriptionImportErrorInfo(
  error: unknown,
  fallbackMessage = DEFAULT_PARSE_FAILURE_MESSAGE
): SubscriptionImportErrorInfo {
  if (isSubscriptionImportError(error)) return error.info;
  const message = error instanceof Error ? error.message : fallbackMessage;
  return createSubscriptionImportErrorInfo({
    category: inferSubscriptionImportErrorCategory(message),
    message,
    detail: message,
  });
}

function mergeNodeSourceIds(existing: ParsedNode, sourceIds: Set<string>): ParsedNode {
  const existingRecord = existing as unknown as Record<string, unknown>;
  return { ...existingRecord, [SOURCE_IDS_KEY]: Array.from(sourceIds) } as unknown as ParsedNode;
}

function filterDialerProxyGroupsByAvailableNames(
  dialerProxyGroups: StoreState["dialerProxyGroups"],
  availableNames: Set<string>
): StoreState["dialerProxyGroups"] {
  return dialerProxyGroups.map((group) => ({
    ...group,
    relayNodes: group.relayNodes.filter((name) => name === "DIRECT" || availableNames.has(name)),
    targetNodes: group.targetNodes.filter((name) => availableNames.has(name)),
  }));
}

export function createSourceActions(set: SetState, get: GetState, setAndGenerateConfig: SetAndGenerateConfig): SourceActions {
  return {
    // 设置订阅源
    setSources: (sources: SubscriptionSource[]) => {
      const prev = get().sources;
      const prevIds = new Set(prev.map((s) => s.id));
      const nextIds = new Set(sources.map((s) => s.id));
      const removed = new Set(Array.from(prevIds).filter((id) => !nextIds.has(id)));

      if (removed.size === 0) {
        set({ sources });
        return;
      }

      setAndGenerateConfig((state) => {
        const nextNodes: ParsedNode[] = [];
        for (const node of state.nodes) {
          const next = withoutNodeSourceIds(node, removed);
          if (next) nextNodes.push(next);
        }

        const availableNames = new Set(nextNodes.map((n) => n.name));
        const nextListenerPorts: Record<string, number> = {};
        for (const [name, port] of Object.entries(state.listenerPorts)) {
          if (!availableNames.has(name)) continue;
          if (typeof port !== "number" || !Number.isInteger(port)) continue;
          nextListenerPorts[name] = port;
        }

        const nextDialerProxyGroups = filterDialerProxyGroupsByAvailableNames(state.dialerProxyGroups, availableNames);

        return {
          sources,
          nodes: nextNodes,
          listenerPorts: nextListenerPorts,
          dialerProxyGroups: nextDialerProxyGroups,
        };
      });
    },

    // 解析订阅内容
    parseContent: (content: string) => {
      set({ isLoading: true });

      try {
        const result: ParseResult = parseSubscription(content);
        const sanitizedNodes = stripImportedNodeControlFieldsFromList(result.nodes);

        setAndGenerateConfig((state) => {
          const normalizeOriginName = (node: ParsedNode): ParsedNode => {
            const record = node as unknown as Record<string, unknown>;
            const origin =
              typeof record["_originName"] === "string" && record["_originName"].trim()
                ? String(record["_originName"])
                : node.name;
            return origin === record["_originName"]
              ? node
              : ({ ...record, _originName: origin } as unknown as ParsedNode);
          };

          const deleted = new Set(state.deletedNodeNames);
          const existingNormalized = state.nodes.map(normalizeOriginName);
          const existingKeys = new Set(state.nodes.map((n) => buildNodeContentKey(n)));
          const deduped = sanitizedNodes.filter((n) => !existingKeys.has(buildNodeContentKey(n)));
          const usedNames = new Set(existingNormalized.map((n) => n.name));
          const uniqueNewNodes = withUniqueNodeNames(deduped, usedNames)
            .map(normalizeOriginName)
            .filter((n) => {
              const origin = String((n as unknown as Record<string, unknown>)["_originName"] ?? n.name);
              return !deleted.has(origin);
            });

          return {
            nodes: [...existingNormalized, ...uniqueNewNodes],
            parseErrors: result.errors,
            isLoading: false,
          };
        });
      } catch (error) {
        set({
          parseErrors: [error instanceof Error ? error.message : "解析失败"],
          isLoading: false,
        });
      }
    },

    // 解析单个订阅源
    parseSingleSource: async (sourceId: string) => {
      const { sources } = get();
      const source = sources.find((s) => s.id === sourceId);
      if (!source || !source.content.trim()) return;

      const currentSourceContent =
        source.type === "url"
          ? (tryNormalizeSubscriptionUrlInput(source.content) ?? source.content.trim())
          : source.content.trim();
      const lastParsedContent =
        typeof source.lastParsedContent === "string" ? source.lastParsedContent.trim() : "";
      const treatAsNewSource =
        source.type === "url" && Boolean(lastParsedContent) && lastParsedContent !== currentSourceContent;

      const currentTag = typeof source.tag === "string" ? source.tag.trim() : "";
      const currentNameTemplate = typeof source.nameTemplate === "string" ? source.nameTemplate.trim() : "";
      const lastTag = typeof source.lastParsedTag === "string" ? source.lastParsedTag.trim() : "";
      const lastNameTemplate = typeof source.lastParsedNameTemplate === "string" ? source.lastParsedNameTemplate.trim() : "";

      // 标记为解析中
      set({
        sources: sources.map((s) =>
          s.id === sourceId ? { ...s, parsing: true, error: undefined, errorInfo: undefined } : s
        ),
      });

      try {
        let contentToParse = source.content;
        let subscriptionUserInfo: SubscriptionUserInfo | undefined;
        let prefetchedParseResult: ParseResult | null = null;

        // URL 源的 proxy-providers 模式：不拉取/解析节点，仅标记为已导入并移除该源原节点
        if (source.type === "url" && source.useProxyProviders) {
          const rawUrl = source.content.trim();
          const normalizedUrl = tryNormalizeSubscriptionUrlInput(rawUrl);
          if (!normalizedUrl) {
            throw new Error("无效的 url 格式");
          }
          const parsed = new URL(normalizedUrl);
          if (!["http:", "https:"].includes(parsed.protocol)) {
            throw new Error("只支持 HTTP/HTTPS url");
          }

          setAndGenerateConfig((state) => {
            const baseNodes = detachSourceNodesFromState(state.nodes, sourceId).nodes;

            const availableNames = new Set(baseNodes.map((n) => n.name));
            const nextListenerPorts: Record<string, number> = {};
            for (const [name, port] of Object.entries(state.listenerPorts)) {
              if (!availableNames.has(name)) continue;
              if (typeof port !== "number" || !Number.isInteger(port)) continue;
              nextListenerPorts[name] = port;
            }

            const nextDialerProxyGroups = filterDialerProxyGroupsByAvailableNames(state.dialerProxyGroups, availableNames);

            return {
              nodes: baseNodes,
              listenerPorts: nextListenerPorts,
              dialerProxyGroups: nextDialerProxyGroups,
              sources: state.sources.map((s) =>
                s.id === sourceId
                  ? {
                      ...s,
                      parsing: false,
                      parsed: true,
                      nodeCount: undefined,
                      subscriptionUserInfo: undefined,
                      error: undefined,
                      errorInfo: undefined,
                      lastParsedContent: normalizedUrl,
                      lastParsedTag: currentTag || undefined,
                      lastParsedNameTemplate: currentNameTemplate || undefined,
                    }
                  : s
              ),
              parseErrors: [],
            };
          });
          return;
        }

        // 如果是 url，需要先获取内容
        if (source.type === "url") {
          const fetched = await fetchUrlContentInBrowser(source.content, {
            userinfoUrl: source.userinfoUrl,
            userinfoUserAgent: source.userinfoUserAgent,
          });
          contentToParse = fetched.content;
          prefetchedParseResult = pickUrlFetchParseResult(fetched);
          const header = fetched.headers["subscription-userinfo"];
          if (typeof header === "string" && header.trim()) {
            const parsed = parseSubscriptionUserInfo(header);
            if (
              typeof parsed.upload === "number" ||
              typeof parsed.download === "number" ||
              typeof parsed.total === "number" ||
              typeof parsed.expire === "number"
            ) {
              subscriptionUserInfo = parsed;
            }
          }
        }

        // 解析内容
        const result = prefetchedParseResult ?? parseSubscription(contentToParse);
        const resolvedSubscriptionUserInfo = resolveSubscriptionUserInfo(subscriptionUserInfo, result.nodes);

        if (result.nodes.length === 0) {
          const errorMsg = result.errors[0] ?? "未解析到有效节点";
          throw new Error(errorMsg);
        }

        const parsedNodes = prepareSourceParsedNodes(result.nodes, {
          currentTag,
          currentNameTemplate,
        });

        // 刷新此订阅源解析出的节点：尽量保留用户顺序/手动改名，仅更新节点内容与来源归属。
        setAndGenerateConfig((state) => {
          const merged = mergeParsedSourceNodes(state.nodes, parsedNodes, state.deletedNodeNames, {
            sourceId,
            currentTag,
            currentNameTemplate,
            lastTag,
            lastNameTemplate,
            treatAsNewSource,
          });

          const nextNodes = merged.nodes;
          const availableNames = new Set(nextNodes.map((n) => n.name));
          const nextListenerPorts: Record<string, number> = {};
          for (const [name, port] of Object.entries(state.listenerPorts)) {
            const mappedName = merged.renameMap.get(name) ?? name;
            if (!availableNames.has(mappedName)) continue;
            if (typeof port !== "number" || !Number.isInteger(port)) continue;
            nextListenerPorts[mappedName] = port;
          }

          const replaceNames = (list: string[], opts?: { keepDirect?: boolean }) => {
            const out: string[] = [];
            const seen = new Set<string>();
            for (const item of list) {
              if (opts?.keepDirect && item === "DIRECT") {
                if (!seen.has(item)) out.push(item);
                seen.add(item);
                continue;
              }
              const next = merged.renameMap.get(item) ?? item;
              if (seen.has(next)) continue;
              seen.add(next);
              out.push(next);
            }
            return out;
          };

          const nextDialerProxyGroups = state.dialerProxyGroups.map((g) => {
            const relayNodes = replaceNames(g.relayNodes, { keepDirect: true }).filter(
              (n) => n === "DIRECT" || availableNames.has(n)
            );
            const targetNodes = replaceNames(g.targetNodes).filter((n) => availableNames.has(n));
            return { ...g, relayNodes, targetNodes };
          });

          return {
            nodes: nextNodes,
            listenerPorts: nextListenerPorts,
            dialerProxyGroups: nextDialerProxyGroups,
            sources: state.sources.map((s) =>
              s.id === sourceId
                ? {
                    ...s,
                    parsing: false,
                    parsed: true,
                    nodeCount: result.nodes.length,
                    subscriptionUserInfo: hasSubscriptionUserInfo(resolvedSubscriptionUserInfo)
                      ? resolvedSubscriptionUserInfo
                      : undefined,
                    error: undefined,
                    errorInfo: undefined,
                    lastParsedContent:
                      source.type === "url"
                        ? (tryNormalizeSubscriptionUrlInput(currentSourceContent) ?? currentSourceContent)
                        : currentSourceContent,
                    lastParsedTag: currentTag || undefined,
                    lastParsedNameTemplate: currentNameTemplate || undefined,
                  }
                : s
            ),
            parseErrors: result.errors.map(sanitizePublicErrorText).filter((e) => e !== ""),
          };
        });
      } catch (error) {
        const baseInfo = toSubscriptionImportErrorInfo(error);
        const shouldHintProxyProviders =
          source.type === "url" &&
          !source.useProxyProviders &&
          !/无效的 url/i.test(baseInfo.message) &&
          !/只支持 HTTP\/HTTPS/i.test(baseInfo.message) &&
          !/proxy-providers/i.test(baseInfo.message);
        const hint = "若错误多次出现，且确信订阅链接正确，可尝试在高级编辑中开启「proxy-providers模式」。";
        const info: SubscriptionImportErrorInfo = shouldHintProxyProviders
          ? {
              ...baseInfo,
              suggestedActions: [...baseInfo.suggestedActions, hint],
            }
          : baseInfo;
        set((state) => ({
          sources: state.sources.map((s) =>
            s.id === sourceId
              ? {
                  ...s,
                  parsing: false,
                  parsed: false,
                  subscriptionUserInfo: undefined,
                  error: info.message,
                  errorInfo: info,
                }
              : s
          ),
        }));
      }
    },

    // 解析多个订阅源
    parseMultipleSources: async (sources: SubscriptionSource[]) => {
      set({ isLoading: true, parseErrors: [] });

      const allNodes: ParsedNode[] = [];
      const allErrors: string[] = [];
      const sourceMeta = new Map<
        string,
        {
          parsed: boolean;
          nodeCount?: number;
          subscriptionUserInfo?: SubscriptionUserInfo;
          error?: string;
          errorInfo?: SubscriptionImportErrorInfo;
          lastParsedContent?: string;
          lastParsedTag?: string;
          lastParsedNameTemplate?: string;
        }
      >();

      for (const source of sources) {
        if (!source.content.trim()) continue;

        try {
          let contentToParse = source.content;
          let subscriptionUserInfo: SubscriptionUserInfo | undefined;
          let prefetchedParseResult: ParseResult | null = null;

          // URL 源的 proxy-providers 模式：不拉取/解析节点，仅更新导入状态（节点由客户端拉取）
          if (source.type === "url" && source.useProxyProviders) {
            const rawUrl = source.content.trim();
            try {
              const normalizedUrl = tryNormalizeSubscriptionUrlInput(rawUrl);
              if (!normalizedUrl) {
                throw new Error("无效的 url 格式");
              }
              const parsed = new URL(normalizedUrl);
              if (!["http:", "https:"].includes(parsed.protocol)) {
                throw new Error("只支持 HTTP/HTTPS url");
              }
            } catch (error) {
              const baseMessage = error instanceof Error ? error.message : "无效的 url 格式";
              const message = `${baseMessage}`;
              const safeUrl = maskUrlForPublicDisplay(rawUrl);
              allErrors.push(sanitizePublicErrorText(`url ${safeUrl} 解析失败: ${message}`));
              sourceMeta.set(source.id, { parsed: false, error: message });
              continue;
            }

            const currentTag = typeof source.tag === "string" ? source.tag.trim() : "";
            const currentNameTemplate = typeof source.nameTemplate === "string" ? source.nameTemplate.trim() : "";
            sourceMeta.set(source.id, {
              parsed: true,
              lastParsedContent: tryNormalizeSubscriptionUrlInput(rawUrl) ?? rawUrl,
              lastParsedTag: currentTag || undefined,
              lastParsedNameTemplate: currentNameTemplate || undefined,
            });
            continue;
          }

          // 如果是 url，需要先获取内容
          if (source.type === "url") {
            try {
              const fetched = await fetchUrlContentInBrowser(source.content, {
                userinfoUrl: source.userinfoUrl,
                userinfoUserAgent: source.userinfoUserAgent,
              });
              contentToParse = fetched.content;
              prefetchedParseResult = pickUrlFetchParseResult(fetched);
              const header = fetched.headers["subscription-userinfo"];
              if (typeof header === "string" && header.trim()) {
                const parsed = parseSubscriptionUserInfo(header);
                if (
                  typeof parsed.upload === "number" ||
                  typeof parsed.download === "number" ||
                  typeof parsed.total === "number" ||
                  typeof parsed.expire === "number"
                ) {
                  subscriptionUserInfo = parsed;
                }
              }
            } catch (fetchError) {
              const baseInfo = toSubscriptionImportErrorInfo(fetchError, "未知错误");
              const shouldHintProxyProviders =
                !source.useProxyProviders &&
                !/无效的 url/i.test(baseInfo.message) &&
                !/只支持 HTTP\/HTTPS/i.test(baseInfo.message) &&
                !/proxy-providers/i.test(baseInfo.message);
              const hint = "若错误多次出现，且确信订阅链接正确，可尝试在高级编辑中开启「proxy-providers模式」。";
              const info: SubscriptionImportErrorInfo = shouldHintProxyProviders
                ? { ...baseInfo, suggestedActions: [...baseInfo.suggestedActions, hint] }
                : baseInfo;
              allErrors.push(sanitizePublicErrorText(`源 #${sources.indexOf(source) + 1} 获取失败: ${info.message}`));
              sourceMeta.set(source.id, {
                parsed: false,
                error: info.message,
                errorInfo: info,
              });
              continue;
            }
          }

          // 解析内容
          const result = prefetchedParseResult ?? parseSubscription(contentToParse);
          const resolvedSubscriptionUserInfo = resolveSubscriptionUserInfo(subscriptionUserInfo, result.nodes);
          const currentTag = typeof source.tag === "string" ? source.tag.trim() : "";
          const currentNameTemplate = typeof source.nameTemplate === "string" ? source.nameTemplate.trim() : "";
          allNodes.push(
            ...prepareSourceParsedNodes(result.nodes, {
              currentTag,
              currentNameTemplate,
            }).map((node) => withNodeSourceId(node, source.id))
          );

          if (result.errors.length > 0) {
            allErrors.push(
              ...result.errors
                .map((e) => sanitizePublicErrorText(`源 #${sources.indexOf(source) + 1}: ${e}`))
                .filter((e) => e !== "")
            );
          }

          sourceMeta.set(source.id, {
            parsed: true,
            nodeCount: result.nodes.length,
            subscriptionUserInfo: hasSubscriptionUserInfo(resolvedSubscriptionUserInfo)
              ? resolvedSubscriptionUserInfo
              : undefined,
            lastParsedContent:
              source.type === "url"
                ? (tryNormalizeSubscriptionUrlInput(source.content.trim()) ?? source.content.trim())
                : source.content.trim(),
            lastParsedTag: currentTag || undefined,
            lastParsedNameTemplate: currentNameTemplate || undefined,
          });
        } catch (error) {
          const baseInfo = toSubscriptionImportErrorInfo(error, "未知错误");
          const shouldHintProxyProviders =
            source.type === "url" &&
            !source.useProxyProviders &&
            !/无效的 url/i.test(baseInfo.message) &&
            !/只支持 HTTP\/HTTPS/i.test(baseInfo.message) &&
            !/proxy-providers/i.test(baseInfo.message);
          const hint = "若错误多次出现，且确信订阅链接正确，可尝试在高级编辑中开启「proxy-providers模式」。";
          const info: SubscriptionImportErrorInfo = shouldHintProxyProviders
            ? { ...baseInfo, suggestedActions: [...baseInfo.suggestedActions, hint] }
            : baseInfo;
          allErrors.push(sanitizePublicErrorText(`源 #${sources.indexOf(source) + 1} 解析失败: ${info.message}`));
          sourceMeta.set(source.id, {
            parsed: false,
            subscriptionUserInfo: undefined,
            error: info.message,
            errorInfo: info,
          });
        }
      }

      // 去重节点（基于 originName + 节点内容）
      const uniqueNodeMap = new Map<string, ParsedNode>();
      for (const node of allNodes) {
        const record = node as unknown as Record<string, unknown>;
        const origin =
          typeof record[ORIGIN_NAME_KEY] === "string" && String(record[ORIGIN_NAME_KEY]).trim()
            ? String(record[ORIGIN_NAME_KEY]).trim()
            : node.name;
        const key = buildScopedNodeIdentityKey(origin, node);
        const existing = uniqueNodeMap.get(key);
        if (!existing) {
          uniqueNodeMap.set(key, node);
          continue;
        }

        const mergedSourceIds = new Set(getNodeSourceIds(existing));
        let changed = false;
        for (const id of getNodeSourceIds(node)) {
          if (mergedSourceIds.has(id)) continue;
          mergedSourceIds.add(id);
          changed = true;
        }
        if (!changed) continue;

        uniqueNodeMap.set(key, mergeNodeSourceIds(existing, mergedSourceIds));
      }
      const uniqueNodes = Array.from(uniqueNodeMap.values());

      // 确保 name 全局唯一（Clash 要求 proxies.name 唯一）
      const uniqueNamedNodes = withUniqueNodeNames(uniqueNodes, new Set<string>());

      setAndGenerateConfig((state) => {
        const deleted = new Set(state.deletedNodeNames);
        const normalized = uniqueNamedNodes
          .map((node) => {
            const record = node as unknown as Record<string, unknown>;
            const origin =
              typeof record["_originName"] === "string" && record["_originName"].trim()
                ? String(record["_originName"])
                : node.name;
            return origin === record["_originName"]
              ? node
              : ({ ...record, _originName: origin } as unknown as ParsedNode);
          })
          .filter((node) => {
            const origin = String((node as unknown as Record<string, unknown>)["_originName"] ?? node.name);
            return !deleted.has(origin);
          });

        const availableNames = new Set(normalized.map((n) => n.name));
        const nextListenerPorts: Record<string, number> = {};
        for (const [name, port] of Object.entries(state.listenerPorts)) {
          if (!availableNames.has(name)) continue;
          if (typeof port !== "number" || !Number.isInteger(port)) continue;
          nextListenerPorts[name] = port;
        }
        const nextDialerProxyGroups = filterDialerProxyGroupsByAvailableNames(state.dialerProxyGroups, availableNames);

        return {
          nodes: normalized,
          parseErrors: allErrors,
          isLoading: false,
          listenerPorts: nextListenerPorts,
          dialerProxyGroups: nextDialerProxyGroups,
          sources: state.sources.map((s) => {
            const meta = sourceMeta.get(s.id);
            if (!meta) return s;
            return {
              ...s,
              parsed: meta.parsed,
              parsing: false,
              ...(typeof meta.nodeCount === "number" ? { nodeCount: meta.nodeCount } : {}),
              ...(meta.subscriptionUserInfo ? { subscriptionUserInfo: meta.subscriptionUserInfo } : { subscriptionUserInfo: undefined }),
              ...(meta.error ? { error: meta.error } : { error: undefined }),
              ...(meta.errorInfo ? { errorInfo: meta.errorInfo } : { errorInfo: undefined }),
              ...(typeof meta.lastParsedContent === "string" && meta.lastParsedContent.trim()
                ? { lastParsedContent: meta.lastParsedContent.trim() }
                : {}),
              ...(typeof meta.lastParsedTag === "string" ? { lastParsedTag: meta.lastParsedTag } : {}),
              ...(typeof meta.lastParsedNameTemplate === "string"
                ? { lastParsedNameTemplate: meta.lastParsedNameTemplate }
                : {}),
            };
          }),
        };
      });
    },
  };
}
