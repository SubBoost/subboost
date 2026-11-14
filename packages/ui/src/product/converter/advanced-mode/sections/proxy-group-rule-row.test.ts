import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captures = vi.hoisted(() => ({
  buttons: [] as any[],
  menuItems: [] as any[],
}));

vi.mock("lucide-react", () => ({
  ArrowRightLeft: () => React.createElement("span", null, "move-icon"),
  Trash2: () => React.createElement("span", null, "trash-icon"),
}));

vi.mock("@subboost/ui/components/ui/badge", () => ({
  Badge: (props: any) => React.createElement("span", props, props.children),
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    captures.buttons.push(props);
    return React.createElement("button", props, props.children);
  },
}));

vi.mock("@subboost/ui/components/ui/dropdown-menu", () => ({
  DropdownMenu: (props: any) => React.createElement("div", null, props.children),
  DropdownMenuContent: (props: any) => React.createElement("div", props, props.children),
  DropdownMenuItem: (props: any) => {
    captures.menuItems.push(props);
    return React.createElement("button", props, props.children);
  },
  DropdownMenuLabel: (props: any) => React.createElement("div", props, props.children),
  DropdownMenuSeparator: (props: any) => React.createElement("hr", props),
  DropdownMenuTrigger: (props: any) => React.createElement("div", null, props.children),
}));

vi.mock("@subboost/ui/lib/utils", () => ({
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(" "),
}));

import {
  ProxyGroupManualRuleRow,
  ProxyGroupRuleMoveMenu,
  ProxyGroupRuleRow,
  ProxyGroupRuleSetRow,
  isRuleSetMoveTarget,
} from "./proxy-group-rule-row";

const targets = [
  { kind: "module", id: "auto", name: "Auto" },
  { kind: "module", id: "fallback", name: "Fallback" },
  { kind: "custom", id: "custom-1", name: "Custom" },
] as any[];

describe("proxy group rule row components", () => {
  beforeEach(() => {
    captures.buttons = [];
    captures.menuItems = [];
  });

  it("detects move targets and renders active, moved, and removed rows", () => {
    expect(isRuleSetMoveTarget(targets[0])).toBe(true);
    expect(isRuleSetMoveTarget(targets[2])).toBe(true);
    expect(isRuleSetMoveTarget({ kind: "filtered", id: "filtered-1", name: "Filtered" } as never)).toBe(false);

    const active = renderToStaticMarkup(
      React.createElement(ProxyGroupRuleRow, {
        title: "Rule",
        detail: "DOMAIN-SUFFIX,example.com,Proxy",
        badges: React.createElement("span", null, "badge"),
        actions: React.createElement("span", null, "action"),
      })
    );
    const moved = renderToStaticMarkup(
      React.createElement(ProxyGroupRuleRow, {
        title: "Moved",
        detail: "detail",
        detailTitle: "custom-title",
        state: "moved",
      })
    );
    const removed = renderToStaticMarkup(
      React.createElement(ProxyGroupRuleRow, {
        title: "Removed",
        detail: "detail",
        state: "removed",
      })
    );

    expect(active).toContain("Rule");
    expect(active).toContain("badge");
    expect(active).toContain("action");
    expect(moved).toContain("已移动");
    expect(moved).toContain("decoration-orange");
    expect(removed).toContain("已移除");
    expect(removed).toContain("decoration-red");
  });

  it("renders rule set badges for every source and behavior variant", () => {
    const html = [
      renderToStaticMarkup(
        React.createElement(ProxyGroupRuleSetRow, {
          name: "Preset domain",
          path: "geosite/preset.mrs",
          source: "preset",
          behavior: "domain",
          noResolve: true,
        })
      ),
      renderToStaticMarkup(
        React.createElement(ProxyGroupRuleSetRow, {
          name: "Custom ip",
          path: "geoip/custom.mrs",
          source: "custom",
          behavior: "ipcidr",
        })
      ),
      renderToStaticMarkup(
        React.createElement(ProxyGroupRuleSetRow, {
          name: "Experimental active",
          path: "geosite/experimental-active.mrs",
          source: "experimental",
          behavior: "domain",
        })
      ),
      renderToStaticMarkup(
        React.createElement(ProxyGroupRuleSetRow, {
          name: "Moved custom",
          path: "geoip/moved.mrs",
          source: "custom",
          behavior: "ipcidr",
          state: "moved",
        })
      ),
      renderToStaticMarkup(
        React.createElement(ProxyGroupRuleSetRow, {
          name: "Experimental",
          path: "geosite/experimental.mrs",
          source: "experimental",
          behavior: "domain",
          state: "removed",
        })
      ),
    ].join("\n");

    expect(html).toContain("预设");
    expect(html).toContain("自定义");
    expect(html).toContain("实验性");
    expect(html).toContain("域名");
    expect(html).toContain("IP");
    expect(html).toContain("no-resolve");
    expect(html).toContain("已移动");
    expect(html).toContain("已移除");
  });

  it("renders manual rows and forwards move and remove callbacks", () => {
    const onMove = vi.fn();
    const onRemove = vi.fn();
    const item = {
      index: 2,
      rule: { id: "manual-1", type: "DOMAIN-SUFFIX", value: "example.com", target: "Proxy", noResolve: true },
    } as const;

    const html = renderToStaticMarkup(
      React.createElement(ProxyGroupManualRuleRow, {
        item,
        targets,
        currentTargetName: "Auto",
        onMove,
        onRemove,
      })
    );

    expect(html).toContain("example.com");
    expect(html).toContain("DOMAIN-SUFFIX,example.com,Proxy,no-resolve");
    expect(html).toContain("自定义");
    expect(captures.buttons.find((props) => props.title === "移动规则")).toBeTruthy();
    captures.menuItems.find((props) => props.children === "Custom").onSelect();
    expect(onMove).toHaveBeenCalledWith(item, targets[2]);

    captures.buttons.find((props) => props.title === "删除规则").onClick();
    expect(onRemove).toHaveBeenCalledWith(item);
  });

  it("renders move menu sections, empty labels, and current-target disabled states", () => {
    const onMove = vi.fn();
    const html = renderToStaticMarkup(
      React.createElement(ProxyGroupRuleMoveMenu, {
        title: "移动规则集",
        ariaLabel: "移动规则集",
        targets: [targets[0], targets[2]],
        kinds: ["module", "custom"],
        currentTarget: { kind: "module", id: "auto", name: "Auto" },
        onMove,
      })
    );

    expect(html).toContain("内置组");
    expect(html).toContain("自定义组");
    expect(html).not.toContain("筛选组");
    expect(captures.menuItems.find((props) => props.children === "Auto").disabled).toBe(true);
    expect(captures.menuItems.find((props) => props.children === "Custom").disabled).toBe(false);

    captures.menuItems.find((props) => props.children === "Custom").onSelect();
    expect(onMove).toHaveBeenCalledWith(targets[2]);

    captures.menuItems = [];
    renderToStaticMarkup(
      React.createElement(ProxyGroupRuleMoveMenu, {
        title: "移动规则集",
        ariaLabel: "移动规则集",
        targets: [targets[1]],
        kinds: ["module"],
        currentTarget: { name: "Fallback" },
        onMove,
      })
    );
    expect(captures.menuItems[0].disabled).toBe(true);
  });

  it("keeps same-named structured destinations selectable for manual rules", () => {
    const same = [{ kind: "module" as const, id: "cn", name: "Regional" }, { kind: "custom" as const, id: "cn", name: "Regional" }];
    renderToStaticMarkup(React.createElement(ProxyGroupManualRuleRow, {
      item: { index: 0, rule: { id: "manual", type: "DOMAIN", value: "local.subboost.test", target: { kind: "custom", id: "cn" } } },
      targets: same, currentTargetName: "Regional", currentTarget: same[1], onMove: vi.fn(), onRemove: vi.fn(),
    }));
    expect(captures.menuItems[0].disabled).toBe(false);
    expect(captures.menuItems[1].disabled).toBe(true);
  });
});
