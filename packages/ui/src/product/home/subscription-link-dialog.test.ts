import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@subboost/ui/store/user-store";

const captures = vi.hoisted(() => ({
  buttons: [] as any[],
  inputs: [] as any[],
  switches: [] as any[],
  dialogs: [] as any[],
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
  Dialog: (props: any) => {
    captures.dialogs.push(props);
    return React.createElement("div", null, props.children);
  },
  DialogContent: (props: any) => React.createElement("div", props, props.children),
  DialogDescription: (props: any) => React.createElement("p", props, props.children),
  DialogFooter: (props: any) => React.createElement("footer", props, props.children),
  DialogHeader: (props: any) => React.createElement("header", props, props.children),
  DialogTitle: (props: any) => React.createElement("h2", props, props.children),
}));

import { SubscriptionLinkDialog } from "./subscription-link-dialog";

const baseUser: User = {
  id: "user-1",
  username: "user",
  name: "User",
  avatarUrl: null,
  trustLevel: 1,
  aiAssistantEnabled: false,
  isAdmin: false,
  isBanned: false,
  active: true,
  silenced: false,
  saveRequirementSatisfied: true,
  saveRequirementSatisfiedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  subscriptionCount: 0,
  templateCount: 0,
  quota: {
    maxSubscriptions: 5,
    maxNodesPerSubscription: 100,
    maxCustomTemplates: 3,
    maxImportSourcesPerType: 2,
    canUseSubscriptionLink: true,
  },
};

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
  user: baseUser,
  handleCopyUrl: vi.fn(),
  handleCreateSubscription: vi.fn(),
};

describe("SubscriptionLinkDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captures.buttons = [];
    captures.inputs = [];
    captures.switches = [];
    captures.dialogs = [];
  });

  it("renders creation controls and wires form callbacks", () => {
    const html = renderToStaticMarkup(
      React.createElement(SubscriptionLinkDialog, {
        ...baseProps,
        autoUpdateEnabled: true,
        autoUpdateHours: 8,
      })
    );

    expect(captures.dialogs[0]).toMatchObject({ open: true });
    expect(html).toContain("生成订阅链接");
    expect(html).toContain("更新时智能匹配节点");
    expect(html).toContain("启用自动更新");
    expect(html).toContain("自动更新间隔");
    expect(html).toContain("注意事项");
    expect(html).toContain("完整订阅链接是持有者凭证");
    expect(html).toContain("所有请求均归属您的账号");
    expect(html).toContain("反复触发限流会临时封禁账号");
    expect(captures.inputs[0]).toMatchObject({ value: "我的配置", maxLength: 100 });
    expect(captures.inputs[1]).toMatchObject({ type: "number", min: 12, step: 1, value: 8 });
    expect(captures.switches).toHaveLength(2);

    captures.inputs[0].onChange({ target: { value: "新配置" } });
    captures.inputs[1].onChange({ target: { value: "12" } });
    captures.switches[0].onCheckedChange(false);
    captures.switches[1].onCheckedChange(false);
    captures.buttons.at(-1).onClick();

    expect(baseProps.setSubscriptionName).toHaveBeenCalledWith("新配置");
    expect(baseProps.setAutoUpdateHours).toHaveBeenCalledWith(12);
    expect(baseProps.setSmartNodeMatchingEnabled).toHaveBeenCalledWith(false);
    expect(baseProps.setAutoUpdateEnabled).toHaveBeenCalledWith(false);
    expect(baseProps.handleCreateSubscription).toHaveBeenCalled();
  });

  it("renders generated links and copy/finish actions", () => {
    const html = renderToStaticMarkup(
      React.createElement(SubscriptionLinkDialog, {
        ...baseProps,
        subscriptionUrl: "https://sub.example.com/sub/token",
        copied: true,
        isEditingExistingSubscription: true,
      })
    );

    expect(html).toContain("订阅链接已更新");
    expect(html).toContain("复制下方链接到 Clash 客户端导入使用");
    expect(html).toContain("更新成功");
    expect(html).toContain("check-icon");
    expect(captures.inputs[0]).toMatchObject({
      value: "https://sub.example.com/sub/token",
      readOnly: true,
    });

    captures.buttons[0].onClick();
    captures.buttons[1].onClick();

    expect(baseProps.handleCopyUrl).toHaveBeenCalled();
    expect(baseProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables link creation while name is empty or a request is running", () => {
    renderToStaticMarkup(
      React.createElement(SubscriptionLinkDialog, {
        ...baseProps,
        subscriptionName: "   ",
        isCreatingSubscription: true,
      })
    );

    expect(captures.buttons.at(-1)).toMatchObject({ disabled: true });
  });
});
