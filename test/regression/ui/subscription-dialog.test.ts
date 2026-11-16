// @ts-expect-error public coverage tests render with the public React runtime.
import * as React from "../../../node_modules/react";
// @ts-expect-error public coverage tests render with the public ReactDOM server runtime.
import { renderToStaticMarkup } from "../../../node_modules/react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captures = vi.hoisted(() => ({
  buttons: [] as any[],
  inputs: [] as any[],
  switches: [] as any[],
}));

vi.mock("lucide-react", () => ({
  Check: () => React.createElement("span", null, "check-icon"),
  Copy: () => React.createElement("span", null, "copy-icon"),
  Link: () => React.createElement("span", null, "link-icon"),
  Loader2: () => React.createElement("span", null, "loading-icon"),
}));

vi.mock("@subboost/ui/components/subscription/smart-node-matching-help", () => ({
  SmartNodeMatchingHelp: ({ enabled }: { enabled: boolean }) =>
    React.createElement("span", null, enabled ? "smart-on" : "smart-off"),
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    captures.buttons.push(props);
    return React.createElement("button", props, props.children);
  },
}));

vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    captures.inputs.push(props);
    return React.createElement("input", props);
  },
}));

vi.mock("@subboost/ui/components/ui/label", () => ({
  Label: (props: any) => React.createElement("label", props, props.children),
}));

vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => {
    captures.switches.push(props);
    return React.createElement("button", {
      type: "button",
      "data-checked": String(props.checked),
      onClick: () => props.onCheckedChange?.(!props.checked),
    });
  },
}));

vi.mock("@subboost/ui/components/ui/dialog", () => ({
  Dialog: (props: any) => React.createElement("div", { "data-open": String(props.open) }, props.children),
  DialogContent: (props: any) => React.createElement("div", props, props.children),
  DialogDescription: (props: any) => React.createElement("p", props, props.children),
  DialogFooter: (props: any) => React.createElement("footer", props, props.children),
  DialogBody: (props: any) => React.createElement("div", props, props.children),
  DialogHeader: (props: any) => React.createElement("header", props, props.children),
  DialogTitle: (props: any) => React.createElement("h2", props, props.children),
}));

import { SubscriptionLinkDialog } from "@subboost/ui/product/home/subscription-link-dialog";

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  subscriptionUrl: "",
  subscriptionName: "我的配置",
  setSubscriptionName: vi.fn(),
  autoUpdateEnabled: false,
  setAutoUpdateEnabled: vi.fn(),
  autoUpdateHours: 24,
  setAutoUpdateHours: vi.fn(),
  autoUpdatePolicy: {
    defaultHours: 24,
    minHours: 12,
    stepHours: 1,
    requireIntegerHours: true,
  },
  smartNodeMatchingEnabled: true,
  setSmartNodeMatchingEnabled: vi.fn(),
  isCreatingSubscription: false,
  copied: false,
  isEditingExistingSubscription: false,
  handleCopyUrl: vi.fn(),
  handleCreateSubscription: vi.fn(),
};

describe("public SubscriptionLinkDialog branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captures.buttons = [];
    captures.inputs = [];
    captures.switches = [];
  });

  it("renders non-edit creation copy and loading state", () => {
    const html = renderToStaticMarkup(
      React.createElement(SubscriptionLinkDialog, {
        ...baseProps,
        autoUpdateEnabled: false,
        isCreatingSubscription: true,
      })
    );

    expect(html).toContain("生成订阅链接");
    expect(html).toContain("生成持久化的订阅链接");
    expect(html).toContain("您可以随时在仪表盘删除订阅");
    expect(html).toContain("loading-icon");
    expect(captures.inputs).toHaveLength(1);
    expect(captures.switches).toHaveLength(2);
  });

  it("renders edit mode before and after a subscription URL exists", () => {
    const editingForm = renderToStaticMarkup(
      React.createElement(SubscriptionLinkDialog, {
        ...baseProps,
        isEditingExistingSubscription: true,
      })
    );
    expect(editingForm).toContain("更新订阅链接");
    expect(editingForm).toContain("将覆盖该订阅的配置与订阅源");
    expect(editingForm).toContain("保存更新");
    expect(editingForm).toContain("订阅链接保持不变");

    const created = renderToStaticMarkup(
      React.createElement(SubscriptionLinkDialog, {
        ...baseProps,
        subscriptionUrl: "https://sub.example.com/sub/token",
        copied: false,
        isEditingExistingSubscription: false,
      })
    );
    expect(created).toContain("订阅链接已生成");
    expect(created).toContain("创建成功");
    expect(created).toContain("您可以在仪表盘中管理所有订阅");
    expect(created).toContain("copy-icon");
  });
});
