"use client";

import * as React from "react";
import { ChevronDown, Shuffle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@subboost/ui/components/ui/dropdown-menu";
import { Input } from "@subboost/ui/components/ui/input";
import { cn } from "@subboost/ui/lib/utils";
import { DEFAULT_PROXY_PROVIDER_FILTER } from "@subboost/core/subscription/proxy-providers";
import type { SubscriptionSource } from "@subboost/ui/store/config-store";
import {
  buildProxyGroupName,
  parseProxyGroupNameDraft,
  pickRandomEmoji,
  PROXY_GROUP_EMOJI_LIBRARY,
} from "@subboost/ui/product/converter/advanced-mode/sections/proxy-group-name-editor";

/**
 * proxy-providers 模式的设置字段（接入模式三选 + key + 组名/emoji [+ filter]）。
 * 主界面状态栏与高级编辑对话框的 provider 设置区共用，都读写同一 source 字段。
 * 组名编辑框：emoji 选择器与名称输入合并在同一个边框容器内（emoji 拼进组名前缀）。
 */

export const PROVIDER_MODE_OPTIONS: Array<{
  value: "grouped" | "inline" | "bare";
  label: string;
  title: string;
}> = [
  { value: "grouped", label: "分组", title: "生成机场组并加入各分流组候选" },
  { value: "inline", label: "内嵌", title: "provider 节点直接注入所有策略组（旧行为）" },
  { value: "bare", label: "仅生成", title: "只写入 proxy-providers，不挂接任何策略组" },
];

// 机场组默认 emoji（与 core 生成回落一致）
export const PROVIDER_GROUP_DEFAULT_EMOJI = "✈️";

type ProviderSettingsSource = Pick<
  SubscriptionSource,
  "id" | "providerKey" | "providerMode" | "providerGroupName" | "providerFilter"
>;

export function resolveProviderMode(source: ProviderSettingsSource): "grouped" | "inline" | "bare" {
  // 旧数据无 providerMode 按内嵌处理（与生成层一致）
  return source.providerMode === "grouped" || source.providerMode === "bare" ? source.providerMode : "inline";
}

export function ProviderSettingsFields({
  source,
  defaultProviderKey,
  onUpdateMeta,
  showFilter = false,
  className,
}: {
  source: ProviderSettingsSource;
  defaultProviderKey: string;
  onUpdateMeta: (id: string, patch: Partial<SubscriptionSource>) => void;
  // filter 编辑框仅在高级编辑对话框的 provider 设置区展示（状态栏空间有限）
  showFilter?: boolean;
  className?: string;
}) {
  const mode = resolveProviderMode(source);
  const groupNameDraft = parseProxyGroupNameDraft(source.providerGroupName ?? "", PROVIDER_GROUP_DEFAULT_EMOJI);
  // 组名为空时 buildProxyGroupName 返回空串，选中的 emoji 无处落盘——用本地态记住，等名字键入后一起写入
  const [draftEmoji, setDraftEmoji] = React.useState<string | null>(null);
  const [emojiQuery, setEmojiQuery] = React.useState("");
  const emoji = (draftEmoji ?? groupNameDraft.emoji) || PROVIDER_GROUP_DEFAULT_EMOJI;
  const filteredEmojis = React.useMemo(() => {
    const keyword = emojiQuery.trim();
    if (!keyword) return PROXY_GROUP_EMOJI_LIBRARY;
    return PROXY_GROUP_EMOJI_LIBRARY.filter((item) => item.includes(keyword));
  }, [emojiQuery]);

  const commitGroupName = (nextEmoji: string, nextName: string) => {
    setDraftEmoji(nextEmoji);
    onUpdateMeta(source.id, { providerGroupName: buildProxyGroupName({ emoji: nextEmoji, name: nextName }) });
  };

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5", className)}>
      <div
        role="radiogroup"
        aria-label="provider 接入方式"
        className="inline-flex flex-none items-center rounded-md border border-white/10 bg-white/5 p-0.5"
      >
        {PROVIDER_MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={mode === option.value}
            onClick={() => onUpdateMeta(source.id, { providerMode: option.value })}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] whitespace-nowrap transition-colors",
              mode === option.value
                ? "bg-indigo-500/20 text-indigo-300"
                : "text-white/40 hover:text-white/60 hover:bg-white/5"
            )}
            title={option.title}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex flex-none items-center justify-end gap-x-3">
        <div className="flex flex-none items-center gap-1.5">
          <span className="text-xs text-white/50 whitespace-nowrap">key:</span>
          <Input
            value={source.providerKey ?? ""}
            onChange={(e) => onUpdateMeta(source.id, { providerKey: e.target.value })}
            placeholder={defaultProviderKey}
            className="h-6 w-[130px] rounded-md px-2 text-xs"
          />
        </div>

        {mode === "grouped" && (
          <div className="flex flex-none items-center gap-1.5">
            <span className="text-xs text-white/50 whitespace-nowrap">组名:</span>
            <div className="flex items-center overflow-hidden rounded-md border border-white/10 bg-white/5 transition-all duration-200 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/50">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-6 flex-none items-center gap-0.5 px-1.5 transition-colors hover:bg-white/10 focus:outline-none"
                    title="选择 emoji"
                    aria-label="选择 emoji"
                  >
                    <span className="text-xs leading-none">{emoji}</span>
                    <ChevronDown className="h-3 w-3 text-white/45" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72 p-2">
                  <Input
                    value={emojiQuery}
                    onChange={(e) => setEmojiQuery(e.target.value)}
                    className="mb-2 h-7 text-xs"
                    placeholder="搜索 emoji"
                  />
                  <div className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto pr-1">
                    <DropdownMenuItem
                      className="flex h-8 items-center justify-center p-0 text-white/75"
                      title="随机 emoji"
                      aria-label="随机 emoji"
                      onClick={() => commitGroupName(pickRandomEmoji(emoji), groupNameDraft.name)}
                    >
                      <Shuffle className="h-3.5 w-3.5" />
                    </DropdownMenuItem>
                    {filteredEmojis.map((item) => (
                      <DropdownMenuItem
                        key={item}
                        className="flex h-8 items-center justify-center p-0 text-base"
                        onClick={() => commitGroupName(item, groupNameDraft.name)}
                      >
                        {item}
                      </DropdownMenuItem>
                    ))}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              <Input
                value={groupNameDraft.name}
                onChange={(e) => commitGroupName(emoji, e.target.value)}
                placeholder="xx机场"
                className="h-6 w-[130px] rounded-none border-0 border-l border-white/10 bg-transparent px-2 text-xs focus:ring-0 focus:border-white/10"
              />
            </div>
          </div>
        )}
      </div>

      {showFilter && (
        <div className="flex w-full min-w-0 items-center gap-1.5">
          <span className="text-xs text-white/50 whitespace-nowrap">filter:</span>
          <Input
            value={source.providerFilter ?? DEFAULT_PROXY_PROVIDER_FILTER}
            onChange={(e) => onUpdateMeta(source.id, { providerFilter: e.target.value })}
            placeholder={DEFAULT_PROXY_PROVIDER_FILTER}
            title="节点过滤正则（mihomo proxy-providers filter）；清空则不过滤"
            className="h-6 min-w-0 flex-1 rounded-md px-2 text-xs font-mono"
          />
        </div>
      )}
    </div>
  );
}
