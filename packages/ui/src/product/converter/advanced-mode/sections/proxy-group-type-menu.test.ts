import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captures = vi.hoisted(() => ({
  buttons: [] as any[],
  contents: [] as any[],
  items: [] as any[],
  subContents: [] as any[],
  subTriggers: [] as any[],
}));

vi.mock("lucide-react", () => ({
  Check: () => React.createElement("span", null, "check-icon"),
  ChevronDown: () => React.createElement("span", null, "down-icon"),
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    captures.buttons.push(props);
    return React.createElement("button", props, props.children);
  },
}));

vi.mock("@subboost/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: (props: any) => React.createElement("div", null, props.children),
  DropdownMenuContent: (props: any) => {
    captures.contents.push(props);
    const { children, sideOffset: _sideOffset, ...domProps } = props;
    return React.createElement("div", domProps, children);
  },
  DropdownMenuItem: (props: any) => {
    captures.items.push(props);
    return React.createElement("button", props, props.children);
  },
  DropdownMenuSub: (props: any) => React.createElement("div", null, props.children),
  DropdownMenuSubContent: (props: any) => {
    captures.subContents.push(props);
    const { children, sideOffset: _sideOffset, ...domProps } = props;
    return React.createElement("div", domProps, children);
  },
  DropdownMenuSubTrigger: (props: any) => {
    captures.subTriggers.push(props);
    return React.createElement("button", props, props.children);
  },
  DropdownMenuTrigger: (props: any) => React.createElement("div", null, props.children),
}));

vi.mock("@subboost/ui/lib/utils", () => ({
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(" "),
}));

import {
  ProxyGroupTypeMenu,
  getLoadBalanceStrategyLabel,
  getProxyGroupTypeLabel,
} from "./proxy-group-type-menu";

describe("ProxyGroupTypeMenu", () => {
  beforeEach(() => {
    captures.buttons = [];
    captures.contents = [];
    captures.items = [];
    captures.subContents = [];
    captures.subTriggers = [];
  });

  it("formats group type and load-balance strategy labels", () => {
    expect(getProxyGroupTypeLabel("url-test")).toBe("自动测速");
    expect(getProxyGroupTypeLabel("fallback")).toBe("故障切换");
    expect(getProxyGroupTypeLabel("load-balance")).toBe("负载均衡");
    expect(getProxyGroupTypeLabel("direct-first")).toBe("直连优先");
    expect(getProxyGroupTypeLabel("reject-first")).toBe("拦截优先");
    expect(getProxyGroupTypeLabel("unknown")).toBe("手动选择");

    expect(getLoadBalanceStrategyLabel("round-robin")).toBe("轮询均摊");
    expect(getLoadBalanceStrategyLabel("sticky-sessions")).toBe("会话保持");
    expect(getLoadBalanceStrategyLabel("consistent-hashing")).toBe("稳定分配");
  });

  it("renders default trigger, selected marks, and dispatches all menu choices", () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      React.createElement(ProxyGroupTypeMenu, {
        value: "load-balance",
        strategy: "round-robin",
        showStrategyLabel: true,
        triggerClassName: "trigger-extra",
        contentClassName: "content-extra",
        contentAlign: "end",
        onChange,
      })
    );

    expect(html).toContain("负载均衡 / 轮询均摊");
    expect(html).toContain("check-icon");
    expect(captures.buttons[0].className).toContain("trigger-extra");
    expect(captures.contents[0]).toEqual(expect.objectContaining({ align: "end" }));
    expect(captures.contents[0].className).toContain("content-extra");
    expect(captures.subContents[0].sideOffset).toBe(4);
    expect(captures.subTriggers[0].className).toContain("cursor-default");

    captures.items.find((props) => props.children[1].props.children === "手动选择").onSelect();
    captures.items.find((props) => props.children[1].props.children === "自动测速").onSelect();
    captures.items.find((props) => props.children[1].props.children === "故障切换").onSelect();
    captures.items.find((props) => props.children[1].props.children === "直连优先").onSelect();
    captures.items.find((props) => props.children[1].props.children === "拦截优先").onSelect();
    captures.items.find((props) => props.children[1].props.children === "会话保持").onSelect();

    expect(onChange).toHaveBeenCalledWith({ groupType: "select" });
    expect(onChange).toHaveBeenCalledWith({ groupType: "url-test" });
    expect(onChange).toHaveBeenCalledWith({ groupType: "fallback" });
    expect(onChange).toHaveBeenCalledWith({ groupType: "direct-first" });
    expect(onChange).toHaveBeenCalledWith({ groupType: "reject-first" });
    expect(onChange).toHaveBeenCalledWith({ groupType: "load-balance", strategy: "sticky-sessions" });
  });

  it("uses a custom trigger and falls back to the default load-balance strategy", () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      React.createElement(ProxyGroupTypeMenu, {
        value: "load-balance",
        onChange,
        trigger: React.createElement("button", { type: "button" }, "custom trigger"),
      })
    );

    expect(html).toContain("custom trigger");
    expect(captures.buttons).toHaveLength(0);
    captures.items.find((props) => props.children[1].props.children === "稳定分配").onSelect();
    expect(onChange).toHaveBeenCalledWith({ groupType: "load-balance", strategy: "consistent-hashing" });
  });
});
