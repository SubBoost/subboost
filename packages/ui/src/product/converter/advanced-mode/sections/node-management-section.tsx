"use client";

import * as React from "react";
import { List, Search } from "lucide-react";
import { Badge } from "@subboost/ui/components/ui/badge";
import { Button } from "@subboost/ui/components/ui/button";
import { confirmDialog } from "@subboost/ui/components/ui/confirm-dialog";
import { Input } from "@subboost/ui/components/ui/input";
import { SwitchField } from "@subboost/ui/components/ui/switch-field";
import { toast } from "@subboost/ui/components/ui/toaster";
import { DEFAULT_NODE_NAME_TEMPLATE } from "@subboost/core/node-name-template";
import { useConfigStore, type SubscriptionSource } from "@subboost/ui/store/config-store";
import { useProductInteractionAdapter } from "@subboost/ui/product/interactions";
import { SectionHeader } from "../section-header";
import { NodeManagementBulkEditDialog } from "./node-management/bulk-edit-dialog";
import { NodeManagementNodeList } from "./node-management/node-list";

const NODE_SOURCE_IDS_KEY = "_sourceIds";
const ORIGIN_NAME_KEY = "_originName";
const LISTENER_PORT_WARNING_STORAGE_KEY = "subboost.listenerPortWarningAccepted";

function hasAcceptedListenerPortWarning(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LISTENER_PORT_WARNING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberListenerPortWarningAccepted() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LISTENER_PORT_WARNING_STORAGE_KEY, "1");
  } catch {
    // Ignore storage failures; the warning can be shown again next time.
  }
}

export function NodeManagementSection({
  isExpanded,
  onToggle,
}: {
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const {
    sources,
    nodes,
    deletedNodeNames,
    deletedNodes,
    removeNode,
    restoreDeletedNode,
    renameNode,
    restoreNodeName,
    bulkRenameNodes,
    moveNode,
    setNodeOrder,
    listenerPorts,
    setListenerPort,
    bulkSetListenerPorts,
  } = useConfigStore();

  const deletedMarkedNodes = React.useMemo(() => {
    const activeOrigins = new Set<string>();
    for (const node of nodes) {
      const record = node as unknown as Record<string, unknown>;
      const origin =
        typeof record[ORIGIN_NAME_KEY] === "string" && String(record[ORIGIN_NAME_KEY]).trim()
          ? String(record[ORIGIN_NAME_KEY]).trim()
          : node.name;
      if (origin) activeOrigins.add(origin);
    }

    const byOrigin = new Map<string, { originName: string; name: string }>();
    const add = (originNameRaw: unknown, nameRaw: unknown) => {
      const originName = typeof originNameRaw === "string" ? originNameRaw.trim() : "";
      const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
      if (!originName) return;
      if (activeOrigins.has(originName)) return;
      if (byOrigin.has(originName)) return;
      byOrigin.set(originName, { originName, name: name || originName });
    };

    for (const item of deletedNodes) {
      if (!item || typeof item !== "object") continue;
      add((item as any).originName, (item as any).name);
    }
    for (const raw of deletedNodeNames) add(raw, raw);

    return Array.from(byOrigin.values());
  }, [deletedNodeNames, deletedNodes, nodes]);

  const [editingNodeName, setEditingNodeName] = React.useState<string | null>(null);
  const [editNodeValue, setEditNodeValue] = React.useState("");
  const [nameRulesOpen, setNameRulesOpen] = React.useState(false);
  const [nodeSearchKeyword, setNodeSearchKeyword] = React.useState("");
  const [listenerPortEnabled, setListenerPortEnabled] = React.useState(false);
  const interactions = useProductInteractionAdapter();

  const [listenerPortDrafts, setListenerPortDrafts] = React.useState<Record<string, string>>({});
  const [listenerPortErrors, setListenerPortErrors] = React.useState<Record<string, string>>({});
  const [orderDrafts, setOrderDrafts] = React.useState<Record<string, string>>({});

  const hasConfiguredListenerPorts = React.useMemo(
    () => Object.values(listenerPorts).some((port) => Number.isInteger(port) && port >= 1 && port <= 65535),
    [listenerPorts]
  );

  React.useEffect(() => {
    if (hasConfiguredListenerPorts) setListenerPortEnabled(true);
  }, [hasConfiguredListenerPorts]);

  const isListenerPortVisible = listenerPortEnabled || hasConfiguredListenerPorts;

  const handleListenerPortChange = React.useCallback(
    async (checked: boolean) => {
      if (!checked) {
        if (hasConfiguredListenerPorts) {
          toast({
            title: "已有监听端口配置",
            description: "请先删除已配置的监听端口，再关闭监听端口。",
            variant: "warning",
          });
          return;
        }
        setListenerPortEnabled(false);
        setListenerPortDrafts({});
        setListenerPortErrors({});
        return;
      }

      if (!hasAcceptedListenerPortWarning()) {
        const ok = await confirmDialog({
          title: "确认开启「监听端口」？",
          description: (
            <span className="block pt-2">
              <span className="block rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 leading-6 text-amber-100/90">
                警告：请确保你的设备处于受信任网络；如果你的监听端口暴露在公网，任何人都可以使用你的节点。
              </span>
              <span className="mt-3 block leading-6 text-white/65">
                如果你不清楚安全风险及规避方法，请不要开启。
              </span>
            </span>
          ),
          cancelText: "取消",
          confirmText: "我已了解，开启",
          variant: "warning",
        });
        if (!ok) return;
        rememberListenerPortWarningAccepted();
      }

      setListenerPortEnabled(true);
    },
    [hasConfiguredListenerPorts]
  );

  const nodeIndexByName = React.useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((n, i) => map.set(n.name, i));
    return map;
  }, [nodes]);

  const visibleNodes = React.useMemo(() => {
    const keyword = nodeSearchKeyword.trim().toLowerCase();
    if (!keyword) return nodes;
    return nodes.filter((node) => node.name.toLowerCase().includes(keyword));
  }, [nodeSearchKeyword, nodes]);

  const visibleDeletedMarkedNodes = React.useMemo(() => {
    const keyword = nodeSearchKeyword.trim().toLowerCase();
    if (!keyword) return deletedMarkedNodes;
    return deletedMarkedNodes.filter(
      (item) =>
        item.name.toLowerCase().includes(keyword) ||
        item.originName.toLowerCase().includes(keyword)
    );
  }, [deletedMarkedNodes, nodeSearchKeyword]);

  const getNodeSourceIds = React.useCallback((node: unknown): string[] => {
    if (!node || typeof node !== "object") return [];
    const record = node as Record<string, unknown>;
    const raw = record[NODE_SOURCE_IDS_KEY];
    if (!Array.isArray(raw)) return [];

    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      if (typeof item !== "string") continue;
      const id = item.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }, []);

  const escapeRegExp = React.useCallback((input: string): string => {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }, []);

  const extractOriginNameFromDisplayName = React.useCallback(
    (displayName: string, tag: string, template?: string): string | null => {
      const name = typeof displayName === "string" ? displayName.trim() : "";
      const cleanedTag = typeof tag === "string" ? tag.trim() : "";
      if (!name || !cleanedTag) return name;

      const pattern = (
        typeof template === "string" && template.trim() ? template.trim() : DEFAULT_NODE_NAME_TEMPLATE
      ).trim();
      if (!pattern.includes("{name}")) return null;

      const markerTag = "__TAG__";
      const markerName = "__NAME__";
      const replaced = pattern.replaceAll("{tag}", markerTag).replaceAll("{name}", markerName);
      const escaped = escapeRegExp(replaced);

      const withTag = escaped.replaceAll(markerTag, escapeRegExp(cleanedTag));
      const parts = withTag.split(markerName);
      if (parts.length < 2) return null;

      const regexStr = `^${parts[0]}(?<name>.+?)${parts.slice(1).join(".+?")}$`;
      let re: RegExp;
      try {
        re = new RegExp(regexStr);
      } catch {
        return null;
      }

      const match = name.match(re);
      const extracted = match?.groups?.name ? String(match.groups.name).trim() : "";
      return extracted || null;
    },
    [escapeRegExp]
  );

  const resolveNodeNameParts = React.useCallback(
    (node: { name: string }) => {
      const displayName = typeof node?.name === "string" ? node.name : "";
      const sourceIds = getNodeSourceIds(node);
      const candidates = sourceIds
        .map((id) => sources.find((s) => s.id === id))
        .filter((s): s is SubscriptionSource => Boolean(s));

      const tags: string[] = [];
      const tagSeen = new Set<string>();
      for (const s of candidates) {
        const raw = typeof s.tag === "string" ? s.tag.trim() : "";
        if (!raw || tagSeen.has(raw)) continue;
        tagSeen.add(raw);
        tags.push(raw);
      }

      const primary =
        candidates.find((s) => {
          const applied = typeof s.lastParsedTag === "string" ? s.lastParsedTag.trim() : "";
          if (applied && displayName.includes(applied)) return true;
          const current = typeof s.tag === "string" ? s.tag.trim() : "";
          return current && displayName.includes(current);
        }) ?? candidates[0] ?? null;

      // 使用“上一次成功导入”的 tag/模板进行解析：避免用户仅修改导入源元数据（tag/模板）但未重新导入时，节点名与当前规则不一致。
      const appliedTagRaw = typeof primary?.lastParsedTag === "string" ? primary.lastParsedTag.trim() : "";
      const currentTagRaw = typeof primary?.tag === "string" ? primary.tag.trim() : "";
      const appliedTag = appliedTagRaw && displayName.includes(appliedTagRaw) ? appliedTagRaw : "";
      const currentTag = currentTagRaw && displayName.includes(currentTagRaw) ? currentTagRaw : "";
      const tag = appliedTag || currentTag;

      const appliedTemplate =
        typeof primary?.lastParsedNameTemplate === "string" && primary.lastParsedNameTemplate.trim()
          ? primary.lastParsedNameTemplate.trim()
          : undefined;
      const currentTemplate =
        typeof primary?.nameTemplate === "string" && primary.nameTemplate.trim()
          ? primary.nameTemplate.trim()
          : undefined;
      const template = appliedTemplate ?? currentTemplate;

      if (!tag) {
        return {
          tags,
          tag: "",
          template,
          baseName: displayName,
          canEditBase: true,
        };
      }

      const origin = extractOriginNameFromDisplayName(displayName, tag, template);
      if (!origin) {
        return {
          tags,
          tag,
          template,
          baseName: displayName,
          canEditBase: false,
        };
      }

      return {
        tags,
        tag,
        template,
        baseName: origin,
        canEditBase: true,
      };
    },
    [extractOriginNameFromDisplayName, getNodeSourceIds, sources]
  );

  const commitListenerPort = React.useCallback(
    (nodeName: string) => {
      const draft = Object.prototype.hasOwnProperty.call(listenerPortDrafts, nodeName)
        ? listenerPortDrafts[nodeName]
        : typeof listenerPorts[nodeName] === "number"
          ? String(listenerPorts[nodeName])
          : "";
      const raw = draft.trim();

      const clearDraft = () =>
        setListenerPortDrafts((prev) => {
          if (!Object.prototype.hasOwnProperty.call(prev, nodeName)) return prev;
          const { [nodeName]: _removed, ...rest } = prev;
          return rest;
        });
      const setError = (msg: string) =>
        setListenerPortErrors((prev) => ({
          ...prev,
          [nodeName]: msg,
        }));
      const clearError = () =>
        setListenerPortErrors((prev) => {
          if (!Object.prototype.hasOwnProperty.call(prev, nodeName)) return prev;
          const { [nodeName]: _removed, ...rest } = prev;
          return rest;
        });

      if (!raw) {
        setListenerPort(nodeName, null);
        clearDraft();
        clearError();
        return;
      }

      const port = Number(raw);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        setError("监听端口需为 1-65535 的整数。");
        return;
      }

      for (const [name, existing] of Object.entries(listenerPorts)) {
        if (name === nodeName) continue;
        if (existing === port) {
          setError(`监听端口冲突：${port}`);
          return;
        }
      }

      clearError();
      clearDraft();
      setListenerPort(nodeName, port);
      interactions.listenerPortConfigured?.({ mode: "advanced" });
    },
    [interactions, listenerPortDrafts, listenerPorts, setListenerPort]
  );

  const clearListenerPortUiState = React.useCallback((nodeNames: string[]) => {
    if (!Array.isArray(nodeNames) || nodeNames.length === 0) return;
    const uniqueNames: string[] = [];
    const seen: Record<string, true> = {};
    for (const raw of nodeNames) {
      const name = typeof raw === "string" ? raw.trim() : "";
      if (!name || seen[name]) continue;
      seen[name] = true;
      uniqueNames.push(name);
    }
    if (uniqueNames.length === 0) return;

    setListenerPortDrafts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const name of uniqueNames) {
        if (!Object.prototype.hasOwnProperty.call(next, name)) continue;
        delete next[name];
        changed = true;
      }
      return changed ? next : prev;
    });

    setListenerPortErrors((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const name of uniqueNames) {
        if (!Object.prototype.hasOwnProperty.call(next, name)) continue;
        delete next[name];
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);


  return (
    <div>
      <SectionHeader
        icon={List}
        title="节点管理"
        isExpanded={isExpanded}
        onToggle={onToggle}
        badge={
          <div className="ml-auto flex items-center gap-2">
            {nodes.length > 0 ? (
              <Badge variant="outline" className="border-green-500/50 bg-green-500/10 text-green-300">
                {nodes.length} 个节点
              </Badge>
            ) : (
              <Badge variant="secondary">无节点</Badge>
            )}
            {deletedMarkedNodes.length > 0 && (
              <Badge variant="outline" className="border-red-500/50 bg-red-500/10 text-red-300">
                {deletedMarkedNodes.length} 已删除
              </Badge>
            )}
          </div>
        }
      />

      {isExpanded && (
        <div className="mt-2 pl-6">
          <div className="flex items-center gap-2 pb-2 pr-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
              <Input
                value={nodeSearchKeyword}
                onChange={(e) => setNodeSearchKeyword(e.target.value)}
                placeholder="搜索节点..."
                disabled={nodes.length === 0 && deletedMarkedNodes.length === 0}
                className="pl-7 text-xs h-7 bg-white/5 border-white/10"
              />
            </div>
            <div className="shrink-0" title="为节点配置 socks5/http 协议的本地监听端口">
              <SwitchField
                label="监听端口"
                checked={isListenerPortVisible}
                onCheckedChange={handleListenerPortChange}
                disabled={nodes.length === 0 && !hasConfiguredListenerPorts}
                density="compact"
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setNameRulesOpen(true)}
              disabled={nodes.length === 0}
              className="h-7 px-2 text-xs"
            >
              批量编辑
            </Button>
          </div>

          <NodeManagementBulkEditDialog
            open={nameRulesOpen}
            onOpenChange={setNameRulesOpen}
            nodes={nodes}
            resolveNodeNameParts={resolveNodeNameParts}
            bulkRenameNodes={bulkRenameNodes}
            listenerPortEnabled={isListenerPortVisible}
            listenerPorts={listenerPorts}
            bulkSetListenerPorts={bulkSetListenerPorts}
            onClearListenerPortUiState={clearListenerPortUiState}
          />

          <NodeManagementNodeList
            nodes={nodes}
            deletedMarkedNodes={deletedMarkedNodes}
            visibleNodes={visibleNodes}
            visibleDeletedMarkedNodes={visibleDeletedMarkedNodes}
            nodeSearchKeyword={nodeSearchKeyword}
            resolveNodeNameParts={resolveNodeNameParts}
            editingNodeName={editingNodeName}
            setEditingNodeName={setEditingNodeName}
            editNodeValue={editNodeValue}
            setEditNodeValue={setEditNodeValue}
            renameNode={renameNode}
            restoreNodeName={restoreNodeName}
            listenerPortDrafts={listenerPortDrafts}
            setListenerPortDrafts={setListenerPortDrafts}
            listenerPorts={listenerPorts}
            listenerPortErrors={listenerPortErrors}
            setListenerPortErrors={setListenerPortErrors}
            commitListenerPort={commitListenerPort}
            orderDrafts={orderDrafts}
            setOrderDrafts={setOrderDrafts}
            nodeIndexByName={nodeIndexByName}
            setNodeOrder={setNodeOrder}
            moveNode={moveNode}
            isListenerPortVisible={isListenerPortVisible}
            removeNode={removeNode}
            restoreDeletedNode={restoreDeletedNode}
          />
        </div>
      )}
    </div>
  );
}
