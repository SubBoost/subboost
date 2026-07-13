import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  switches: [] as any[],
  providerSettings: [] as any[],
}));

vi.mock("@radix-ui/react-popover", () => ({
  Arrow: () => React.createElement("span", null, "arrow"),
  Content: (props: any) => React.createElement("div", props, props.children),
  Portal: (props: any) => React.createElement("div", null, props.children),
  Root: (props: any) => React.createElement("div", null, props.children),
  Trigger: (props: any) => React.createElement("div", null, props.children),
}));
vi.mock("lucide-react", () => ({
  HelpCircle: () => React.createElement("span", null, "help-icon"),
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => {
    mocks.switches.push(props);
    return React.createElement("input", { type: "checkbox", checked: props.checked, onChange: props.onCheckedChange });
  },
}));
vi.mock("./provider-settings-fields", () => ({
  ProviderSettingsFields: (props: any) => {
    mocks.providerSettings.push(props);
    return React.createElement("div", null, "provider-settings-fields");
  },
}));

import { ProviderModeStatusBar } from "./provider-mode-status-bar";

const baseSource = {
  id: "s1",
  type: "url",
  content: "https://example.com/sub",
} as any;

function renderBar(sourceOverrides: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  mocks.switches = [];
  mocks.providerSettings = [];
  const handlers = {
    source: { ...baseSource, ...sourceOverrides },
    defaultProviderKey: "url_s1",
    onCheckedChange: vi.fn(),
    onUpdateMeta: vi.fn(),
    ...props,
  };
  const html = renderToStaticMarkup(React.createElement(ProviderModeStatusBar, handlers as any));
  return { html, handlers };
}

describe("ProviderModeStatusBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the embedded bar with the proxy-providers help copy", () => {
    const { html } = renderBar({}, { className: "custom-bar-class" });

    expect(html).toContain("proxy-providers模式");
    expect(html).toContain("proxy-providers 模式");
    expect(html).toContain("交由客户端自行拉取节点");
    expect(html).toContain("custom-bar-class");
    expect(html).toContain("border-t");
    expect(mocks.switches[0]).toEqual(expect.objectContaining({ checked: false }));
    // 关闭时不渲染右侧设置区
    expect(mocks.providerSettings).toEqual([]);
    expect(html).not.toContain("provider-settings-fields");
  });

  it("forwards switch changes as booleans", () => {
    const { handlers } = renderBar();

    mocks.switches[0].onCheckedChange(true);
    expect(handlers.onCheckedChange).toHaveBeenCalledWith(true);
    mocks.switches[0].onCheckedChange(false);
    expect(handlers.onCheckedChange).toHaveBeenCalledWith(false);
  });

  it("shows provider settings on the right side when enabled", () => {
    const { html, handlers } = renderBar({ useProxyProviders: true, providerMode: "grouped" });

    expect(html).toContain("provider-settings-fields");
    expect(mocks.providerSettings[0]).toEqual(
      expect.objectContaining({
        source: expect.objectContaining({ id: "s1", providerMode: "grouped" }),
        defaultProviderKey: "url_s1",
        onUpdateMeta: handlers.onUpdateMeta,
      })
    );
  });
});
