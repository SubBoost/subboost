import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  inputs: [] as any[],
  menuItems: [] as any[],
}));

vi.mock("lucide-react", () => ({
  ChevronDown: () => React.createElement("span", null, "chevron-down"),
  Shuffle: () => React.createElement("span", null, "shuffle-icon"),
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.inputs.push(props);
    return React.createElement("input", props);
  },
}));
vi.mock("@subboost/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: (props: any) => React.createElement("div", null, props.children),
  DropdownMenuContent: (props: any) => React.createElement("div", null, props.children),
  DropdownMenuItem: (props: any) => {
    mocks.menuItems.push(props);
    return React.createElement("div", null, props.children);
  },
  DropdownMenuTrigger: (props: any) => React.createElement("div", null, props.children),
}));
vi.mock("@subboost/ui/product/converter/advanced-mode/sections/proxy-group-name-editor", () => ({
  PROXY_GROUP_EMOJI_LIBRARY: ["✈️", "🚀", "🧩"],
  pickRandomEmoji: () => "🎲",
  parseProxyGroupNameDraft: (raw: string, fallbackEmoji = "🧩") => {
    const match = typeof raw === "string" ? raw.match(/^(\S+)\s+(.*)$/) : null;
    if (match) return { emoji: match[1], name: match[2] };
    return { emoji: fallbackEmoji, name: (raw ?? "").trim() };
  },
  buildProxyGroupName: (draft: any) => {
    const name = (draft?.name ?? "").trim();
    const emoji = (draft?.emoji ?? "").trim();
    if (!name) return "";
    return emoji ? `${emoji} ${name}` : name;
  },
}));

import {
  PROVIDER_GROUP_DEFAULT_EMOJI,
  PROVIDER_MODE_OPTIONS,
  ProviderSettingsFields,
  resolveProviderMode,
} from "./provider-settings-fields";
import { DEFAULT_PROXY_PROVIDER_FILTER } from "@subboost/core/subscription/proxy-providers";

const baseSource = { id: "s1" } as any;

function renderFields(sourceOverrides: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  mocks.inputs = [];
  mocks.menuItems = [];
  const onUpdateMeta = vi.fn();
  const html = renderToStaticMarkup(
    React.createElement(ProviderSettingsFields, {
      source: { ...baseSource, ...sourceOverrides },
      defaultProviderKey: "url_s1",
      onUpdateMeta,
      ...props,
    })
  );
  return { html, onUpdateMeta };
}

describe("ProviderSettingsFields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves legacy sources without providerMode as inline", () => {
    expect(resolveProviderMode({ id: "s1" } as any)).toBe("inline");
    expect(resolveProviderMode({ id: "s1", providerMode: "grouped" } as any)).toBe("grouped");
    expect(resolveProviderMode({ id: "s1", providerMode: "bare" } as any)).toBe("bare");
  });

  it("renders mode options and forwards mode changes", () => {
    const { html, onUpdateMeta } = renderFields({ providerMode: "grouped" });

    for (const option of PROVIDER_MODE_OPTIONS) {
      expect(html).toContain(option.label);
    }

    const keyInput = mocks.inputs.find((props: any) => props.placeholder === "url_s1");
    keyInput.onChange({ target: { value: "my_airport" } });
    expect(onUpdateMeta).toHaveBeenCalledWith("s1", { providerKey: "my_airport" });
  });

  it("merges the emoji picker and group name into a single edit box (grouped mode only)", () => {
    const grouped = renderFields({ providerMode: "grouped", providerGroupName: "" });

    // 默认 emoji ✈️ 显示在合并编辑框左侧的选择按钮上
    expect(grouped.html).toContain(PROVIDER_GROUP_DEFAULT_EMOJI);
    expect(grouped.html).toContain("选择 emoji");
    // 名称输入是同一容器内的无边框输入（border-l 分隔）
    const nameInput = mocks.inputs.find((props: any) => props.placeholder === "xx机场");
    expect(String(nameInput.className)).toContain("border-l");
    // emoji 拼进组名（上游惯例）
    nameInput.onChange({ target: { value: "测试机场" } });
    expect(grouped.onUpdateMeta).toHaveBeenCalledWith("s1", {
      providerGroupName: `${PROVIDER_GROUP_DEFAULT_EMOJI} 测试机场`,
    });

    const inline = renderFields({ providerMode: "inline" });
    expect(mocks.inputs.find((props: any) => props.placeholder === "xx机场")).toBeUndefined();
    expect(inline.html).not.toContain("组名:");
  });

  it("commits emoji selections from the embedded dropdown", () => {
    const { onUpdateMeta } = renderFields({ providerMode: "grouped", providerGroupName: "✈️ 机场A" });

    const rocketItem = mocks.menuItems.find((props: any) => props.children === "🚀");
    rocketItem.onClick();
    expect(onUpdateMeta).toHaveBeenCalledWith("s1", { providerGroupName: "🚀 机场A" });

    const shuffleItem = mocks.menuItems.find((props: any) => props.title === "随机 emoji");
    shuffleItem.onClick();
    expect(onUpdateMeta).toHaveBeenCalledWith("s1", { providerGroupName: "🎲 机场A" });
  });

  it("shows the filter editor only when requested and keeps the default regex visible", () => {
    const withoutFilter = renderFields({ providerMode: "grouped" });
    expect(withoutFilter.html).not.toContain("filter:");

    const { onUpdateMeta } = renderFields({ providerMode: "grouped" }, { showFilter: true });
    const filterInput = mocks.inputs.find((props: any) => props.placeholder === DEFAULT_PROXY_PROVIDER_FILTER);
    // 未设置时编辑框显示默认正则（与生成层一致）
    expect(filterInput).toEqual(expect.objectContaining({ value: DEFAULT_PROXY_PROVIDER_FILTER }));
    filterInput.onChange({ target: { value: "(?i)hk" } });
    expect(onUpdateMeta).toHaveBeenCalledWith("s1", { providerFilter: "(?i)hk" });

    renderFields({ providerMode: "grouped", providerFilter: "" }, { showFilter: true });
    const clearedInput = mocks.inputs.find((props: any) => props.placeholder === DEFAULT_PROXY_PROVIDER_FILTER);
    expect(clearedInput).toEqual(expect.objectContaining({ value: "" }));
  });
});
