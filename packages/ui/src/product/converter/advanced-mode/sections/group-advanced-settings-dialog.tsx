"use client";

import * as React from "react";
import { Button } from "@subboost/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@subboost/ui/components/ui/dialog";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { Input } from "@subboost/ui/components/ui/input";
import { SwitchField } from "@subboost/ui/components/ui/switch-field";
import {
  DEFAULT_LOAD_BALANCE_STRATEGY,
  type GroupListenerBinding,
  type GroupListenerTarget,
  type LoadBalanceStrategy,
  type ProxyGroupGroupType,
} from "@subboost/core/types/config";
import { ProxyGroupTypeMenu } from "./proxy-group-type-menu";
import { normalizeGroupTestUrl } from "@subboost/core/proxy-group-advanced";
import {
  validateGroupListenerPort,
  type GroupListenerConflictState,
} from "./group-listener-settings";

export interface GroupAdvancedSettingsValue {
  testUrl?: string;
  groupType: ProxyGroupGroupType;
  strategy?: LoadBalanceStrategy;
  listener: { port: number; enabled: boolean; allowLan: boolean } | null;
}

interface GroupAdvancedSettingsDialogProps {
  testUrl?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupName: string;
  groupType: ProxyGroupGroupType;
  strategy?: LoadBalanceStrategy;
  listenerTarget: GroupListenerTarget;
  listenerBinding?: GroupListenerBinding;
  conflictState: GroupListenerConflictState;
  onSave: (value: GroupAdvancedSettingsValue) => void;
}

/**
 * 策略组统一高级设置弹窗：组类型、负载均衡策略（仅 load-balance）、监听端口。
 * 保存/取消语义：所有修改保存前只存在于本地 state，取消不落任何变更。
 */
export function GroupAdvancedSettingsDialog({
  open,
  onOpenChange,
  groupName,
  groupType,
  strategy,
  testUrl,
  listenerTarget,
  listenerBinding,
  conflictState,
  onSave,
}: GroupAdvancedSettingsDialogProps) {
  const [draftType, setDraftType] = React.useState<ProxyGroupGroupType>(groupType);
  const [draftStrategy, setDraftStrategy] = React.useState<LoadBalanceStrategy>(
    strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY
  );
  const [listenerOn, setListenerOn] = React.useState(false);
  const [portInput, setPortInput] = React.useState("");
  const [allowLan, setAllowLan] = React.useState(false);
  const [draftTestUrl, setDraftTestUrl] = React.useState(testUrl ?? "");

  // 每次打开时从当前配置重建草稿，丢弃上次未保存的修改
  React.useEffect(() => {
    if (!open) return;
    setDraftType(groupType);
    setDraftTestUrl(testUrl ?? "");
    setDraftStrategy(strategy ?? DEFAULT_LOAD_BALANCE_STRATEGY);
    setListenerOn(Boolean(listenerBinding && listenerBinding.enabled !== false));
    setPortInput(listenerBinding ? String(listenerBinding.port) : "");
    setAllowLan(listenerBinding?.allowLan === true);
  }, [open, groupType, strategy, testUrl, listenerBinding]);

  // 开关关闭=暂停（保留配置不生成），端口只需格式合法、无需无冲突（与生成器一致）
  const portCheck = React.useMemo(
    () => validateGroupListenerPort(portInput, conflictState, listenerTarget, { checkConflict: listenerOn }),
    [portInput, conflictState, listenerTarget, listenerOn]
  );
  // 仅当监听开启，或关闭但保留了端口值时才需要端口合法（允许清空端口来彻底移除配置）
  const portRequired = listenerOn || portInput.trim() !== "";
  const portError = portRequired ? portCheck.error : null;
  const testUrlError = draftType === "url-test" && draftTestUrl.trim() && !normalizeGroupTestUrl(draftTestUrl)
    ? "请输入有效的 HTTP/HTTPS 地址" : undefined;
  const canSave = !portError && !testUrlError;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      groupType: draftType,
      testUrl: draftTestUrl.trim() || undefined,
      ...(draftType === "load-balance" ? { strategy: draftStrategy } : {}),
      listener: portRequired && portCheck.port !== null
        ? { port: portCheck.port, enabled: listenerOn, allowLan }
        : null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="break-words pr-6 text-fg">{groupName} · 高级设置</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <FormField label="代理组类型">
            <ProxyGroupTypeMenu
              value={draftType}
              strategy={draftStrategy}
              showStrategyLabel
              onChange={(next) => {
                setDraftType(next.groupType);
                if (next.strategy) setDraftStrategy(next.strategy);
              }}
            />
          </FormField>

          {draftType === "url-test" && (
            <FormField label="测速地址" description="仅用于当前代理组；留空沿用默认测速地址。" error={testUrlError}>
              <Input value={draftTestUrl} onChange={(event) => setDraftTestUrl(event.target.value)}
                placeholder="https://www.gstatic.com/generate_204" className="h-8 text-xs" />
            </FormField>
          )}

          <div className="space-y-3">
            <SwitchField
              label="监听端口"
              description="为该策略组打开一个 mixed 入站端口，流量固定走此组"
              checked={listenerOn}
              onCheckedChange={setListenerOn}
              density="compact"
            />

            {(listenerOn || portInput.trim() !== "") && (
              <div className="space-y-3 rounded-xl border border-ink/10 bg-ink/[0.025] p-3">
                <FormField label="端口" error={portError}>
                  <Input
                    value={portInput}
                    inputMode="numeric"
                    placeholder="例如 7891"
                    className="h-8 border-ink/10 bg-ink/5 text-xs"
                    onChange={(event) => setPortInput(event.target.value)}
                  />
                </FormField>

                <SwitchField
                  label="允许其他设备访问"
                  checked={allowLan}
                  onCheckedChange={setAllowLan}
                  density="compact"
                />
                {allowLan && (
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] leading-relaxed text-amber-200">
                    开启后监听 0.0.0.0，如果你的端口能从公网访问，任何人都可以使用你的节点。
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs text-fg-65 hover:text-fg"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 px-3 text-xs"
            disabled={!canSave}
            onClick={handleSave}
          >
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
