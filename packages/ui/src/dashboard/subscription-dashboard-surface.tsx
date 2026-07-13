"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FileCode,
  MoreVertical,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Trash2,
} from "lucide-react";

import { Button } from "@subboost/ui/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@subboost/ui/components/ui/card";
import { confirmDialog } from "@subboost/ui/components/ui/confirm-dialog";
import { toast } from "@subboost/ui/components/ui/toaster";
import { useUserStore, type User } from "@subboost/ui/store/user-store";
import {
  autoUpdateIntervalHoursToSeconds,
  autoUpdateIntervalSecondsToHours,
  getAutoUpdateIntervalPolicyMinLabel,
  resolveAutoUpdateIntervalPolicy,
  type AutoUpdateIntervalPolicyOverride,
} from "@subboost/core/subscription/auto-update-interval";
import { DashboardStatsCards } from "@subboost/ui/dashboard/dashboard-stats-cards";
import { formatDashboardDate, formatIntervalLabel } from "@subboost/ui/dashboard/dashboard-format";
import { buildRefreshSubscriptionSuccessToast } from "@subboost/ui/dashboard/dashboard-refresh-toast";
import { SubscriptionSettingsDialog } from "@subboost/ui/dashboard/subscription-settings-dialog";
import type { RefreshSubscriptionResponse, Subscription } from "@subboost/ui/dashboard/dashboard-types";

type UpdateSettingsPayload = {
  name: string;
  smartNodeMatchingEnabled: boolean;
  autoUpdateInterval: number | null;
};

export type DashboardSurfaceAdapter = {
  loginHref?: string;
  newSubscriptionHref?: string;
  templatesHref?: string | null;
  settingsHref?: string | null;
  settingsTitle?: string;
  settingsDescription?: string;
  autoUpdateIntervalPolicy?: AutoUpdateIntervalPolicyOverride;
  editSubscriptionHref?: (subscription: Subscription) => string;
  fetchSubscriptions: () => Promise<Subscription[]>;
  deleteSubscription: (id: string) => Promise<void>;
  refreshSubscription: (id: string) => Promise<RefreshSubscriptionResponse>;
  updateSubscriptionSettings: (id: string, payload: UpdateSettingsPayload) => Promise<void>;
  resolveDownloadUrl?: (subscription: Subscription) => string;
  renderAnnouncement?: (context: { user: User }) => React.ReactNode;
  renderHeaderActions?: (context: { user: User }) => React.ReactNode;
  renderExtraQuickActions?: (context: { user: User }) => React.ReactNode;
  beforeStatsSlot?: React.ReactNode;
};

type Props = {
  adapter: DashboardSurfaceAdapter;
};

function buildYamlDownloadFilename(name: string): string {
  const base =
    String(name || "subboost-config")
      .trim()
      .replace(/[\r\n]/g, " ")
      .replace(/[<>:"/\\|?*]+/g, "")
      .replace(/\s+/g, "_")
      .replace(/\.(?:ya?ml)$/i, "")
      .slice(0, 80) || "subboost-config";
  return `${base}.yaml`;
}

function triggerBrowserDownload(href: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = "noopener noreferrer";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  } catch {
    return false;
  }
}

export function SubscriptionDashboardSurface({ adapter }: Props) {
  const { user, isLoading: userLoading, fetchUser } = useUserStore();
  const [subscriptions, setSubscriptions] = React.useState<Subscription[]>([]);
  const autoUpdateNoticeRef = React.useRef<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [refreshingId, setRefreshingId] = React.useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [settingsSub, setSettingsSub] = React.useState<Subscription | null>(null);
  const [settingsName, setSettingsName] = React.useState("");
  const [smartNodeMatchingEnabled, setSmartNodeMatchingEnabled] = React.useState(true);
  const [autoUpdateEnabled, setAutoUpdateEnabled] = React.useState(false);
  const autoUpdatePolicy = React.useMemo(
    () => resolveAutoUpdateIntervalPolicy(user?.isAdmin === true, adapter.autoUpdateIntervalPolicy),
    [adapter.autoUpdateIntervalPolicy, user?.isAdmin]
  );
  const [autoUpdateHours, setAutoUpdateHours] = React.useState<number>(autoUpdatePolicy.defaultHours);
  const [savingSettings, setSavingSettings] = React.useState(false);

  React.useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  const fetchSubscriptions = React.useCallback(async () => {
    try {
      const nextSubscriptions = await adapter.fetchSubscriptions();
      setSubscriptions(nextSubscriptions);
    } catch (error) {
      console.error("Failed to fetch subscriptions:", error);
      setSubscriptions([]);
    } finally {
      setIsLoading(false);
    }
  }, [adapter]);

  React.useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    void fetchSubscriptions();
  }, [user, fetchSubscriptions]);

  React.useEffect(() => {
    if (!user) return;
    const disabled = subscriptions.filter((sub) => sub.autoUpdateState.disabledAt && sub.autoUpdateState.disabledReason);
    if (disabled.length === 0) return;

    const unseen = disabled.filter((sub) => {
      const fingerprint = `${sub.autoUpdateState.disabledAt}:${sub.autoUpdateState.disabledReason}`;
      const storageKey = `subboost:notice:auto_update_disabled:${user.id}:${sub.id}`;
      try {
        if (localStorage.getItem(storageKey) === fingerprint) return false;
        localStorage.setItem(storageKey, fingerprint);
      } catch {}
      return true;
    });
    const firstDisabled = unseen[0];
    if (!firstDisabled) return;

    const eventKey = unseen.map((sub) => `${sub.id}:${sub.autoUpdateState.disabledAt}`).join("|");
    if (autoUpdateNoticeRef.current === eventKey) return;
    autoUpdateNoticeRef.current = eventKey;

    toast({
      title: unseen.length === 1 ? "自动更新已关闭" : `${unseen.length} 个订阅的自动更新已关闭`,
      description: (
        <div className="whitespace-pre-line">
          {[
            unseen.length === 1
              ? `「${firstDisabled.name}」的订阅源连续拉取失败，系统已关闭自动更新。`
              : "部分订阅源连续拉取失败，系统已关闭对应订阅的自动更新。",
            "当前可用配置仍会保留；请检查订阅 URL 是否失效、是否限制服务端/代理 IP，必要时重新复制订阅链接后再开启自动更新。",
          ].join("\n")}
        </div>
      ),
      variant: "warning",
    });
  }, [subscriptions, user]);

  const copyToClipboard = async (subscriptionUrl: string, id: string) => {
    const copied = await copyText(subscriptionUrl);
    if (!copied) {
      toast({ title: "复制失败，请手动复制订阅链接", variant: "destructive" });
      return;
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const downloadSubscription = async (subscription: Subscription) => {
    const filename = buildYamlDownloadFilename(subscription.name);
    try {
      const response = await fetch(adapter.resolveDownloadUrl?.(subscription) ?? subscription.subscriptionUrl);
      if (!response.ok) throw new Error(`Download failed with status ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      triggerBrowserDownload(objectUrl, filename);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch (error) {
      console.error("Failed to fetch subscription YAML for download:", error);
      toast({
        title: "下载失败",
        description: "请刷新页面后重试，或先复制订阅链接到代理软件。",
        variant: "destructive",
      });
    }
  };

  const deleteSubscription = async (id: string) => {
    const ok = await confirmDialog({
      title: "确定要删除这个订阅吗？",
      confirmText: "删除",
      variant: "destructive",
    });
    if (!ok) return;

    try {
      await adapter.deleteSubscription(id);
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    } catch (error) {
      console.error("Failed to delete subscription:", error);
      toast({ title: "删除失败，请稍后重试", variant: "destructive" });
    }
  };

  const refreshSubscription = async (id: string) => {
    if (refreshingId) return;
    setRefreshingId(id);
    try {
      const data = await adapter.refreshSubscription(id);
      await fetchSubscriptions();
      toast(buildRefreshSubscriptionSuccessToast(data));
    } catch (error) {
      console.error("Failed to refresh subscription:", error);
      toast({ title: error instanceof Error ? error.message : "刷新失败，请稍后重试", variant: "destructive" });
    } finally {
      setRefreshingId(null);
    }
  };

  const openSubscriptionSettings = (sub: Subscription) => {
    setSettingsSub(sub);
    setSettingsName(sub.name);
    setSmartNodeMatchingEnabled(sub.smartNodeMatchingEnabled !== false);
    const hours = sub.autoUpdateInterval ? autoUpdateIntervalSecondsToHours(sub.autoUpdateInterval) : autoUpdatePolicy.defaultHours;
    setAutoUpdateHours(Math.max(autoUpdatePolicy.minHours, Number.isFinite(hours) ? hours : autoUpdatePolicy.defaultHours));
    setAutoUpdateEnabled(Boolean(sub.autoUpdateInterval));
    setSettingsOpen(true);
  };

  const saveSubscriptionSettings = async () => {
    if (!settingsSub || savingSettings) return;

    const name = settingsName.trim();
    if (!name || name.length > 100) {
      toast({ title: "订阅名称不能为空且长度不能超过 100 字符", variant: "warning" });
      return;
    }

    const hoursValue = Number(autoUpdateHours);
    if (autoUpdateEnabled) {
      if (!Number.isFinite(hoursValue) || hoursValue <= 0) {
        toast({ title: "自动更新间隔必须是有效小时数", variant: "warning" });
        return;
      }
      if (autoUpdatePolicy.requireIntegerHours && !Number.isInteger(hoursValue)) {
        toast({ title: "自动更新间隔必须是整数小时", variant: "warning" });
        return;
      }
      if (hoursValue < autoUpdatePolicy.minHours) {
        toast({
          title: `自动更新最小间隔为 ${getAutoUpdateIntervalPolicyMinLabel(autoUpdatePolicy)}`,
          variant: "warning",
        });
        return;
      }
    }

    const nextAutoUpdateInterval = autoUpdateEnabled ? autoUpdateIntervalHoursToSeconds(hoursValue) : null;
    setSavingSettings(true);
    try {
      await adapter.updateSubscriptionSettings(settingsSub.id, {
        name,
        smartNodeMatchingEnabled,
        autoUpdateInterval: nextAutoUpdateInterval,
      });

      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === settingsSub.id
            ? {
                ...s,
                name,
                smartNodeMatchingEnabled,
                autoUpdateInterval: nextAutoUpdateInterval,
                ...(autoUpdateEnabled
                  ? {
                      autoUpdateState: {
                        externalFailureCount: 0,
                        failureSourceState: null,
                        lastFailedAt: null,
                        lastAttemptedAt: null,
                        disabledAt: null,
                        disabledReason: null,
                        disabledPreviousInterval: null,
                      },
                    }
                  : {}),
              }
            : s
        )
      );
      setSettingsOpen(false);
    } catch (error) {
      console.error("Failed to save subscription settings:", error);
      toast({ title: error instanceof Error ? error.message : "保存失败，请稍后重试", variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  };

  if (userLoading) return <DashboardSkeleton />;
  if (!user) return <LoginPrompt loginHref={adapter.loginHref ?? "/login"} />;

  const newSubscriptionHref = adapter.newSubscriptionHref ?? "/?newSubscription=1";
  const editSubscriptionHref = adapter.editSubscriptionHref ?? ((sub: Subscription) => `/?editSubscriptionId=${sub.id}`);

  return (
    <div className="container mx-auto px-4 py-8">
      {adapter.renderAnnouncement?.({ user })}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">我的订阅</h1>
          <p className="text-white/50">管理您的订阅链接</p>
        </div>
        <div className="flex items-center gap-2">
          {adapter.renderHeaderActions?.({ user })}
          <Link href={newSubscriptionHref}>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              新建订阅
            </Button>
          </Link>
        </div>
      </div>

      {adapter.beforeStatsSlot}

      <DashboardStatsCards subscriptionCount={subscriptions.length} user={user} />

      <Card>
        <CardHeader>
          <CardTitle>订阅列表</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 bg-white/10 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="text-center py-12">
              <FileCode className="h-12 w-12 mx-auto text-white/40 mb-4" />
              <h3 className="text-lg font-medium mb-2">暂无订阅</h3>
              <p className="text-white/50 mb-4">创建您的第一个订阅配置</p>
              <Link href={newSubscriptionHref}>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  新建订阅
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {subscriptions.map((sub) => (
                <SubscriptionRow
                  key={sub.id}
                  sub={sub}
                  copiedId={copiedId}
                  refreshingId={refreshingId}
                  editHref={editSubscriptionHref(sub)}
                  onCopy={copyToClipboard}
                  onDelete={deleteSubscription}
                  onDownload={downloadSubscription}
                  onRefresh={refreshSubscription}
                  onSettings={openSubscriptionSettings}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <SubscriptionSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        subscription={settingsSub}
        settingsName={settingsName}
        setSettingsName={setSettingsName}
        smartNodeMatchingEnabled={smartNodeMatchingEnabled}
        setSmartNodeMatchingEnabled={setSmartNodeMatchingEnabled}
        autoUpdateEnabled={autoUpdateEnabled}
        setAutoUpdateEnabled={setAutoUpdateEnabled}
        autoUpdateHours={autoUpdateHours}
        setAutoUpdateHours={setAutoUpdateHours}
        savingSettings={savingSettings}
        onSave={saveSubscriptionSettings}
        userIsAdmin={user?.isAdmin === true}
        autoUpdatePolicy={autoUpdatePolicy}
      />

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {adapter.templatesHref && (
          <QuickActionCard
            href={adapter.templatesHref}
            icon={<FileCode className="h-6 w-6" />}
            iconClassName="bg-purple-500/20 text-purple-500"
            title="我的模板"
            description="管理和分享您的配置模板"
          />
        )}

        {adapter.settingsHref && (
          <QuickActionCard
            href={adapter.settingsHref}
            icon={<Settings className="h-6 w-6" />}
            iconClassName="bg-gray-500/20 text-gray-500"
            title={adapter.settingsTitle ?? "账户设置"}
            description={adapter.settingsDescription ?? "管理您的账户和数据导出"}
          />
        )}

        {adapter.renderExtraQuickActions?.({ user })}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-white/10 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-white/10 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

function LoginPrompt({ loginHref }: { loginHref: string }) {
  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <div className="max-w-md mx-auto space-y-4">
        <Shield className="h-16 w-16 mx-auto text-white/50" />
        <h1 className="text-2xl font-bold">请先登录</h1>
        <p className="text-white/50">登录后可以管理您的订阅和模板</p>
        <Link href={loginHref}>
          <Button size="lg">登录</Button>
        </Link>
      </div>
    </div>
  );
}

function SubscriptionRow({
  sub,
  copiedId,
  refreshingId,
  editHref,
  onCopy,
  onDelete,
  onDownload,
  onRefresh,
  onSettings,
}: {
  sub: Subscription;
  copiedId: string | null;
  refreshingId: string | null;
  editHref: string;
  onCopy: (subscriptionUrl: string, id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDownload: (sub: Subscription) => Promise<void>;
  onRefresh: (id: string) => Promise<void>;
  onSettings: (sub: Subscription) => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-4 sm:items-center">
        <div className="p-2 rounded-lg bg-white/10">
          <FileCode className="h-5 w-5 text-primary-500" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate font-medium">{sub.name}</h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/50">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              创建于 {formatDashboardDate(sub.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <RefreshCw className="h-3.5 w-3.5" />
              更新于 {formatDashboardDate(sub.lastUpdatedAt)}
            </span>
            {sub.autoUpdateInterval && (
              <span className="flex items-center gap-1">
                <RefreshCw className="h-3.5 w-3.5" />
                每 {formatIntervalLabel(sub.autoUpdateInterval)} 刷新缓存
              </span>
            )}
            {!sub.autoUpdateInterval && sub.autoUpdateState.disabledAt && sub.autoUpdateState.disabledReason && (
              <span className="flex items-center gap-1 text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" />
                自动更新已关闭：{sub.autoUpdateState.disabledReason}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
        <Link href={editHref}>
          <Button variant="ghost" size="sm" className="gap-0 sm:gap-2" title="回到首页编辑该订阅（更新后链接不变）">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">编辑</span>
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSettings(sub)}
          className="gap-0 sm:gap-2"
          title="订阅设置（改名 / 自动更新）"
        >
          <MoreVertical className="h-4 w-4" />
          <span className="hidden sm:inline">设置</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void onRefresh(sub.id)}
          disabled={refreshingId === sub.id}
          className="gap-0 sm:gap-2"
          title="重新生成配置并刷新缓存"
        >
          <RefreshCw className={`h-4 w-4 ${refreshingId === sub.id ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">刷新</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void onCopy(sub.subscriptionUrl, sub.id)}
          className="gap-0 sm:gap-2"
          title="复制订阅链接"
        >
          {copiedId === sub.id ? (
            <>
              <Check className="h-4 w-4 text-green-500" />
              <span className="hidden sm:inline text-green-500">已复制</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              <span className="hidden sm:inline">链接</span>
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void onDownload(sub)}
          className="gap-0 sm:gap-2"
          title="下载订阅配置"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">下载</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void onDelete(sub.id)}
          className="gap-0 text-red-400 hover:text-red-300 hover:bg-red-500/10 sm:gap-2"
          title="删除订阅"
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">删除</span>
        </Button>
      </div>
    </div>
  );
}

function QuickActionCard({
  href,
  icon,
  iconClassName,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  iconClassName: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer hover:border-white/20 transition-colors">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-lg ${iconClassName}`}>{icon}</div>
            <div>
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-white/50">{description}</p>
            </div>
            <ExternalLink className="ml-auto h-5 w-5 text-white/40" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
