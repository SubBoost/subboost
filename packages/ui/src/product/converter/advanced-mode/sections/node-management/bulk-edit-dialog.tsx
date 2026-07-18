"use client";

import * as React from "react";
import { Button } from "@subboost/ui/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@subboost/ui/components/ui/dialog";
import { Input } from "@subboost/ui/components/ui/input";
import { SwitchField } from "@subboost/ui/components/ui/switch-field";
import { toast } from "@subboost/ui/components/ui/toaster";
import { formatNodeNameFromTemplate } from "@subboost/core/node-name-template";
import { useProductInteractionAdapter } from "@subboost/ui/product/interactions";
import type { ParsedNode } from "@subboost/core/types/node";

type NodeNameParts = {
  tags: string[];
  tag: string;
  template?: string;
  baseName: string;
  canEditBase: boolean;
};

export function NodeManagementBulkEditDialog({
  open,
  onOpenChange,
  nodes,
  resolveNodeNameParts,
  bulkRenameNodes,
  listenerPortEnabled,
  listenerPorts,
  bulkSetListenerPorts,
  onClearListenerPortUiState,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: ParsedNode[];
  resolveNodeNameParts: (node: { name: string }) => NodeNameParts;
  bulkRenameNodes: (renames: Array<{ oldName: string; newName: string }>) => void;
  listenerPortEnabled: boolean;
  listenerPorts: Record<string, number>;
  bulkSetListenerPorts: (patch: Record<string, number | null>) => void;
  onClearListenerPortUiState: (nodeNames: string[]) => void;
}) {
  // 批量编辑（方案 B）
  const interactions = useProductInteractionAdapter();
  const [nameRulesInclude, setNameRulesInclude] = React.useState("");
  const [nameRulesExclude, setNameRulesExclude] = React.useState("");
  const [nameRulesFind, setNameRulesFind] = React.useState("");
  const [nameRulesReplace, setNameRulesReplace] = React.useState("");
  const [nameRulesTrim, setNameRulesTrim] = React.useState(true);
  const [nameRulesCollapseSpaces, setNameRulesCollapseSpaces] = React.useState(true);
  const [nameRulesStartListenerPort, setNameRulesStartListenerPort] = React.useState("");

  const nameRulesPlan = React.useMemo(() => {
    const compile = (raw: string, flags: string) => {
      const pattern = typeof raw === "string" ? raw.trim() : "";
      if (!pattern) return { re: null as RegExp | null, error: null as string | null };
      try {
        return { re: new RegExp(pattern, flags), error: null as string | null };
      } catch {
        return { re: null as RegExp | null, error: "无效正则" };
      }
    };

    const include = compile(nameRulesInclude, "i");
    const exclude = compile(nameRulesExclude, "i");
    const find = compile(nameRulesFind, "ig");
    const previewMode = include.re || exclude.re ? ("matched" as const) : ("changes" as const);

    const renames: Array<{ oldName: string; newName: string }> = [];
    const matchedNames: string[] = [];
    const preview: Array<{
      oldName: string;
      newName: string;
      status: "change" | "unchanged" | "skipped";
      reason?: string;
    }> = [];
    let matchedCount = 0;
    let skippedCount = 0;

    for (const node of nodes) {
      const oldName = (node?.name || "").toString();
      if (!oldName) continue;
      if (include.re && !include.re.test(oldName)) continue;
      if (exclude.re && exclude.re.test(oldName)) continue;
      matchedCount += 1;
      matchedNames.push(oldName);

      const parts = resolveNodeNameParts(node);
      if (parts.tag && !parts.canEditBase) {
        skippedCount += 1;
        if (previewMode === "matched" || find.re) {
          preview.push({
            oldName,
            newName: oldName,
            status: "skipped",
            reason: "跳过：当前节点命名模板无法解析 {name}",
          });
        }
        continue;
      }

      let base = parts.canEditBase ? parts.baseName : oldName;
      if (nameRulesTrim) base = base.trim();
      if (nameRulesCollapseSpaces) base = base.replace(/\s+/g, " ");
      if (find.re) base = base.replace(find.re, nameRulesReplace);

      const nextName = parts.tag
        ? formatNodeNameFromTemplate({ originName: base, tag: parts.tag, template: parts.template })
        : base;

      if (!nextName.trim()) {
        if (previewMode === "matched" || find.re) {
          preview.push({
            oldName,
            newName: oldName,
            status: "skipped",
            reason: "跳过：新名称为空",
          });
        }
        continue;
      }

      const willChange = nextName !== oldName;
      const shouldPreview = previewMode === "matched" ? true : willChange;
      if (shouldPreview) {
        preview.push({
          oldName,
          newName: nextName,
          status: willChange ? "change" : "unchanged",
        });
      }

      if (!willChange) continue;
      renames.push({ oldName, newName: nextName });
    }

    return {
      renames,
      matchedNames,
      preview,
      previewMode,
      matchedCount,
      skippedCount,
      hasError: Boolean(include.error || exclude.error || find.error),
      errors: {
        include: include.error,
        exclude: exclude.error,
        find: find.error,
      },
    };
  }, [
    nameRulesCollapseSpaces,
    nameRulesExclude,
    nameRulesFind,
    nameRulesInclude,
    nameRulesReplace,
    nameRulesTrim,
    nodes,
    resolveNodeNameParts,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>批量编辑</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-[11px] text-white/40">
            仅修改节点名中的 {"{name}"} 部分，不改变导入源 tag；筛选基于完整节点名（含 tag）。
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="text-xs text-white/60">筛选：包含正则（可选）</div>
              <Input
                value={nameRulesInclude}
                onChange={(e) => setNameRulesInclude(e.target.value)}
                placeholder="例如: \\[A\\]"
                className="text-xs font-mono"
              />
              {nameRulesPlan.errors.include && (
                <div className="text-[10px] text-red-400">{nameRulesPlan.errors.include}</div>
              )}
            </div>
            <div className="space-y-1">
              <div className="text-xs text-white/60">筛选：排除正则（可选）</div>
              <Input
                value={nameRulesExclude}
                onChange={(e) => setNameRulesExclude(e.target.value)}
                placeholder="例如: (测试|过期)"
                className="text-xs font-mono"
              />
              {nameRulesPlan.errors.exclude && (
                <div className="text-[10px] text-red-400">{nameRulesPlan.errors.exclude}</div>
              )}
            </div>
          </div>

          <div className={listenerPortEnabled ? "grid gap-3 lg:grid-cols-2" : "grid gap-3"}>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-white/60">批量重命名</div>
                <div className="shrink-0 text-[10px] text-white/40">将修改 {nameRulesPlan.renames.length}</div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-white/60">查找（正则，可选）</div>
                <Input
                  value={nameRulesFind}
                  onChange={(e) => setNameRulesFind(e.target.value)}
                  placeholder="例如: \\s+\\|\\s+"
                  className="text-xs font-mono"
                />
                {nameRulesPlan.errors.find && (
                  <div className="text-[10px] text-red-400">{nameRulesPlan.errors.find}</div>
                )}
              </div>

              <div className="space-y-1">
                <div className="text-xs text-white/60">替换为</div>
                <Input
                  value={nameRulesReplace}
                  onChange={(e) => setNameRulesReplace(e.target.value)}
                  placeholder="例如: -"
                  className="text-xs font-mono"
                />
                <div className="text-[10px] text-white/40">支持 $1、$2… 分组引用；留空表示删除匹配内容</div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <SwitchField
                  label="去除首尾空格"
                  checked={nameRulesTrim}
                  onCheckedChange={setNameRulesTrim}
                  density="compact"
                />
                <SwitchField
                  label="空白归一化"
                  checked={nameRulesCollapseSpaces}
                  onCheckedChange={setNameRulesCollapseSpaces}
                  density="compact"
                />
              </div>
            </div>

            {listenerPortEnabled && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-white/60">监听端口批量操作</div>
                  <div className="shrink-0 text-[10px] text-white/40">对命中节点生效：{nameRulesPlan.matchedCount}</div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-white/60">起始监听端口</div>
                  <Input
                    value={nameRulesStartListenerPort}
                    onChange={(e) => setNameRulesStartListenerPort(e.target.value)}
                    placeholder="例如: 42000"
                    inputMode="numeric"
                    className="text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-white/60">批量操作</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button
                      onClick={() => {
                        if (nameRulesPlan.hasError) return;
                        if (nameRulesPlan.matchedNames.length === 0) {
                          toast({ title: "暂无匹配节点", variant: "warning" });
                          return;
                        }

                        const raw = nameRulesStartListenerPort.trim();
                        const startListenerPort = Number(raw);
                        if (
                          !raw ||
                          !Number.isInteger(startListenerPort) ||
                          startListenerPort < 1 ||
                          startListenerPort > 65535
                        ) {
                          toast({ title: "起始监听端口需为 1-65535 的整数", variant: "warning" });
                          return;
                        }

                        const endListenerPort = startListenerPort + nameRulesPlan.matchedNames.length - 1;
                        if (endListenerPort > 65535) {
                          toast({
                            title: "监听端口超出范围",
                            description: `命中 ${nameRulesPlan.matchedNames.length} 个节点时，最大监听端口将达到 ${endListenerPort}`,
                            variant: "warning",
                          });
                          return;
                        }

                        const targets = new Set(nameRulesPlan.matchedNames);
                        const reserved = new Map<number, string>();
                        for (const [name, port] of Object.entries(listenerPorts)) {
                          if (targets.has(name)) continue;
                          if (typeof port !== "number") continue;
                          reserved.set(port, name);
                        }

                        for (let i = 0; i < nameRulesPlan.matchedNames.length; i += 1) {
                          const port = startListenerPort + i;
                          const conflictName = reserved.get(port);
                          if (!conflictName) continue;
                          toast({
                            title: `监听端口冲突：${port}`,
                            description: `已被节点占用：${conflictName}`,
                            variant: "destructive",
                          });
                          return;
                        }

                        const patch: Record<string, number | null> = {};
                        for (let i = 0; i < nameRulesPlan.matchedNames.length; i += 1) {
                          patch[nameRulesPlan.matchedNames[i]] = startListenerPort + i;
                        }
                        bulkSetListenerPorts(patch);
                        interactions.listenerPortConfigured?.({ mode: "advanced" });
                        onClearListenerPortUiState(nameRulesPlan.matchedNames);
                        toast({
                          title: `已自动填充监听端口 ${nameRulesPlan.matchedNames.length} 个节点`,
                          variant: "success",
                        });
                      }}
                      disabled={nameRulesPlan.hasError || nameRulesPlan.matchedNames.length === 0}
                      className="h-auto min-h-9 min-w-0 px-3 py-2 text-xs leading-4 whitespace-normal"
                    >
                      自动填充监听端口
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        if (nameRulesPlan.hasError) return;
                        if (nameRulesPlan.matchedNames.length === 0) {
                          toast({ title: "暂无匹配节点", variant: "warning" });
                          return;
                        }
                        const patch: Record<string, number | null> = {};
                        for (const name of nameRulesPlan.matchedNames) patch[name] = null;
                        bulkSetListenerPorts(patch);
                        onClearListenerPortUiState(nameRulesPlan.matchedNames);
                        toast({
                          title: `已批量删除监听端口 ${nameRulesPlan.matchedNames.length} 个节点`,
                          variant: "success",
                        });
                      }}
                      disabled={nameRulesPlan.hasError || nameRulesPlan.matchedNames.length === 0}
                      className="h-auto min-h-9 min-w-0 px-3 py-2 text-xs leading-4 whitespace-normal"
                    >
                      批量删除监听端口
                    </Button>
                  </div>

                  <div className="text-[10px] text-white/40">
                    将按当前节点顺序为命中节点填充监听端口：起始监听端口 + 序号
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-xs text-white/60">预览</div>
              <div className="text-[10px] text-white/40">
                匹配 {nameRulesPlan.matchedCount} · 将修改 {nameRulesPlan.renames.length}
                {nameRulesPlan.skippedCount > 0 ? ` · 跳过 ${nameRulesPlan.skippedCount}` : ""}
              </div>
            </div>

            {nameRulesPlan.preview.length === 0 ? (
              <div className="text-[10px] text-white/40 py-2">
                {nameRulesPlan.previewMode === "matched" ? "暂无匹配节点" : "暂无可预览的变更"}
              </div>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                {nameRulesPlan.preview.map((item) => (
                  <div
                    key={item.oldName}
                    className="text-[11px] bg-white/5 rounded border border-white/10 px-2 py-1 space-y-0.5"
                  >
                    <div className="text-white/60 truncate" title={item.oldName}>
                      {item.oldName}
                    </div>
                    {item.status === "skipped" ? (
                      <div className="text-amber-200 truncate" title={item.reason || "跳过"}>
                        {item.reason || "跳过"}
                      </div>
                    ) : item.status === "change" ? (
                      <div className="text-emerald-200 truncate" title={item.newName}>
                        {item.newName}
                      </div>
                    ) : (
                      <div className="text-white/30 truncate" title="无变更">
                        无变更
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => onOpenChange(false)} className="h-8">
              取消
            </Button>
            <Button
              onClick={() => {
                if (nameRulesPlan.hasError) return;
                if (nameRulesPlan.renames.length > 0) {
                  bulkRenameNodes(nameRulesPlan.renames);
                  toast({
                    title: `已批量重命名 ${nameRulesPlan.renames.length} 个节点`,
                    description:
                      nameRulesPlan.skippedCount > 0
                        ? `跳过 ${nameRulesPlan.skippedCount} 个无法解析的节点`
                        : undefined,
                    variant: "success",
                  });
                }
                onOpenChange(false);
              }}
              disabled={nameRulesPlan.hasError}
              className="h-8"
            >
              完成
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
