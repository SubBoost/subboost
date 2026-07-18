"use client";

import { Button } from "@subboost/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@subboost/ui/components/ui/dialog";
import { Input } from "@subboost/ui/components/ui/input";
import { FormField } from "@subboost/ui/components/ui/form-field";
import { Switch } from "@subboost/ui/components/ui/switch";
import { SwitchField } from "@subboost/ui/components/ui/switch-field";
import { SmartNodeMatchingHelp } from "@subboost/ui/components/subscription/smart-node-matching-help";
import {
  getAutoUpdateIntervalPolicyMinLabel,
  resolveAutoUpdateIntervalPolicy,
  type AutoUpdateIntervalPolicy,
} from "@subboost/core/subscription/auto-update-interval";
import type { Subscription } from "./dashboard-types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subscription: Subscription | null;
  settingsName: string;
  setSettingsName: (value: string) => void;
  smartNodeMatchingEnabled: boolean;
  setSmartNodeMatchingEnabled: (value: boolean) => void;
  autoUpdateEnabled: boolean;
  setAutoUpdateEnabled: (value: boolean) => void;
  autoUpdateHours: number;
  setAutoUpdateHours: (value: number) => void;
  savingSettings: boolean;
  onSave: () => void;
  userIsAdmin: boolean;
  autoUpdatePolicy?: AutoUpdateIntervalPolicy;
};

export function SubscriptionSettingsDialog({
  open,
  onOpenChange,
  subscription,
  settingsName,
  setSettingsName,
  smartNodeMatchingEnabled,
  setSmartNodeMatchingEnabled,
  autoUpdateEnabled,
  setAutoUpdateEnabled,
  autoUpdateHours,
  setAutoUpdateHours,
  savingSettings,
  onSave,
  userIsAdmin,
  autoUpdatePolicy,
}: Props) {
  const policy = autoUpdatePolicy ?? resolveAutoUpdateIntervalPolicy(userIsAdmin);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>订阅设置</DialogTitle>
          <DialogDescription>
            改名与自动更新配置（最小 {getAutoUpdateIntervalPolicyMinLabel(policy)}，按创建时间计时）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <FormField label="订阅名称">
            <Input
              value={settingsName}
              onChange={(e) => setSettingsName(e.target.value)}
              maxLength={100}
              placeholder="例如：我的配置"
            />
          </FormField>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm text-white/70">更新时智能匹配节点</p>
                <SmartNodeMatchingHelp enabled={smartNodeMatchingEnabled} />
              </div>
            </div>
            <Switch
              checked={smartNodeMatchingEnabled}
              onCheckedChange={setSmartNodeMatchingEnabled}
              aria-label="更新时智能匹配节点"
            />
          </div>

          <SwitchField
            label="启用自动更新"
            description="开启后服务器会按间隔刷新缓存"
            checked={autoUpdateEnabled}
            onCheckedChange={setAutoUpdateEnabled}
          />

          {!autoUpdateEnabled && subscription?.autoUpdateState.disabledAt && subscription.autoUpdateState.disabledReason && (
            <div className="rounded-md border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100">
              自动更新已关闭：{subscription.autoUpdateState.disabledReason}。当前可用配置仍会保留；检查订阅 URL 后可重新开启自动更新。
            </div>
          )}

          {autoUpdateEnabled && (
            <FormField label="自动更新间隔（小时）">
              <Input
                type="number"
                min={policy.minHours}
                step={policy.stepHours}
                value={autoUpdateHours}
                onChange={(e) => setAutoUpdateHours(Number(e.target.value))}
              />
            </FormField>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={savingSettings}>
            取消
          </Button>
          <Button onClick={onSave} disabled={savingSettings}>
            {savingSettings ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
