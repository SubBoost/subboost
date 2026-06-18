import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@subboost/ui/store/user-store";

const mocks = vi.hoisted(() => ({
  buttons: [] as any[],
  tabs: [] as any[],
  links: [] as any[],
  subscriptionDialog: undefined as any,
  yamlHighlight: undefined as any,
  interactions: {
    modeChanged: vi.fn(),
  },
}));

const baseUser: User = {
  id: "user-1",
  username: "alice",
  name: "Alice",
  avatarUrl: null,
  trustLevel: 1,
  aiAssistantEnabled: true,
  isAdmin: false,
  isBanned: false,
  active: true,
  silenced: false,
  saveRequirementSatisfied: true,
  saveRequirementSatisfiedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  subscriptionCount: 1,
  templateCount: 0,
  quota: {
    maxSubscriptions: 5,
    maxNodesPerSubscription: 100,
    maxCustomTemplates: 3,
    maxImportSourcesPerType: 2,
    canUseSubscriptionLink: true,
  },
};

vi.mock("next/link", () => ({
  default: (props: any) => {
    mocks.links.push(props);
    return React.createElement("a", { href: props.href }, props.children);
  },
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: () => React.createElement("span", null, "alert-icon"),
  Download: () => React.createElement("span", null, "download-icon"),
  ExternalLink: () => React.createElement("span", null, "external-icon"),
  Eye: () => React.createElement("span", null, "eye-icon"),
  Loader2: () => React.createElement("span", null, "loader-icon"),
  Settings2: () => React.createElement("span", null, "settings-icon"),
  Upload: () => React.createElement("span", null, "upload-icon"),
  Zap: () => React.createElement("span", null, "zap-icon"),
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.buttons.push(props);
    return React.createElement("button", props, props.children);
  },
}));

vi.mock("@subboost/ui/components/ui/card", () => ({
  Card: (props: any) => React.createElement("section", props, props.children),
  CardContent: (props: any) => React.createElement("div", props, props.children),
  CardFooter: (props: any) => React.createElement("footer", props, props.children),
  CardHeader: (props: any) => React.createElement("header", props, props.children),
  CardTitle: (props: any) => React.createElement("h2", props, props.children),
}));

vi.mock("@subboost/ui/components/ui/tabs", () => ({
  Tabs: (props: any) => {
    mocks.tabs.push(props);
    return React.createElement("div", { "data-tabs-value": props.value ?? props.defaultValue }, props.children);
  },
  TabsContent: (props: any) => React.createElement("div", { "data-tabs-content": props.value }, props.children),
  TabsList: (props: any) => React.createElement("div", props, props.children),
  TabsTrigger: (props: any) => React.createElement("button", props, props.children),
}));

vi.mock("@subboost/ui/product/converter/quick-mode", () => ({
  QuickMode: () => React.createElement("div", null, "quick-mode"),
}));

vi.mock("@subboost/ui/product/converter/advanced-mode", () => ({
  AdvancedMode: () => React.createElement("div", null, "advanced-mode"),
}));

vi.mock("@subboost/ui/product/home/unsaved-prompt", () => ({
  UnsavedPrompt: () => React.createElement("div", null, "unsaved-prompt"),
}));

vi.mock("@subboost/ui/product/preview/visual-graph", () => ({
  VisualGraph: () => React.createElement("div", null, "visual-graph"),
}));

vi.mock("@subboost/ui/product/preview/diff-highlight", () => ({
  YamlHighlight: (props: any) => {
    mocks.yamlHighlight = props;
    return React.createElement("pre", null, props.content);
  },
}));

vi.mock("@subboost/ui/product/home/subscription-link-dialog", () => ({
  SubscriptionLinkDialog: (props: any) => {
    mocks.subscriptionDialog = props;
    return React.createElement("div", null, "subscription-dialog");
  },
}));

vi.mock("@subboost/ui/product/interactions", () => ({
  useProductInteractionAdapter: () => mocks.interactions,
}));

import { HomeLayout } from "./home-layout";

function createSubscription(overrides: Record<string, unknown> = {}) {
  return {
    subscriptionDialog: false,
    setSubscriptionDialog: vi.fn(),
    subscriptionName: "Primary",
    setSubscriptionName: vi.fn(),
    subscriptionUrl: "",
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
    saveRequirementDialog: false,
    setSaveRequirementDialog: vi.fn(),
    isEditingExistingSubscription: false,
    handleGenerateSubscription: vi.fn(),
    handleAcceptSaveRequirement: vi.fn(),
    handleCreateSubscription: vi.fn(),
    handleCopyUrl: vi.fn(),
    ...overrides,
  };
}

const baseProps = {
  showAiColumn: false,
  user: null,
  authChecked: false,
  editingSubscription: null,
  isLoadingEditingSubscription: false,
  editSubscriptionId: null,
  generatedYaml: "",
  generatedYamlError: null,
  configLoading: false,
  hasValidSources: false,
  handleGenerate: vi.fn(),
  handleDownload: vi.fn(),
  subscription: createSubscription(),
};

describe("HomeLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buttons = [];
    mocks.tabs = [];
    mocks.links = [];
    mocks.subscriptionDialog = undefined;
    mocks.yamlHighlight = undefined;
    vi.stubGlobal("window", { location: { href: "" } });
  });

  it("renders the empty preview state and disabled primary actions", () => {
    const renderAnnouncement = vi.fn(() => "announcement-home");
    const subscription = createSubscription();
    const html = renderToStaticMarkup(
      React.createElement(HomeLayout, {
        ...baseProps,
        showAiColumn: true,
        subscription,
        noticeSlot: "notice-slot",
        renderAnnouncement,
        saveRequirementSlot: "save-requirement-slot",
      })
    );

    expect(renderAnnouncement).toHaveBeenCalledWith({
      placement: "home",
      authChecked: false,
      user: null,
    });
    expect(html).toContain("SubBoost");
    expect(html).toContain("quick-mode");
    expect(html).toContain("advanced-mode");
    expect(html).toContain("visual-graph");
    expect(html).toContain("# 请先添加订阅或节点");
    expect(html).toContain("AI 助手施工中");
    expect(html).toContain("notice-slot");
    expect(html).toContain("save-requirement-slot");
    expect(html).toContain("subscription-dialog");
    expect(mocks.buttons[0]).toMatchObject({ disabled: true });
    expect(mocks.buttons[1]).toMatchObject({ disabled: true });
    expect(mocks.buttons[2]).toMatchObject({ disabled: true });
    expect(mocks.subscriptionDialog).toMatchObject({
      open: false,
      subscriptionName: "Primary",
      autoUpdatePolicy: {
        defaultHours: 24,
        minHours: 12,
        stepHours: 1,
        requireIntegerHours: true,
      },
      smartNodeMatchingEnabled: true,
    });
  });

  it("wires advanced edit actions, config transfer actions, and YAML preview", () => {
    const handleGenerate = vi.fn();
    const handleDownload = vi.fn();
    const onConfigImport = vi.fn();
    const onConfigExport = vi.fn();
    const subscription = createSubscription({
      subscriptionDialog: true,
      subscriptionUrl: "https://example.com/sub",
      isEditingExistingSubscription: true,
    });
    const user = baseUser;

    renderToStaticMarkup(
      React.createElement(HomeLayout, {
        ...baseProps,
        user,
        authChecked: true,
        editingSubscription: {
          id: "sub-1",
          token: "token-1",
          name: "Existing subscription",
          autoUpdateInterval: 86400,
          smartNodeMatchingEnabled: true,
        },
        isLoadingEditingSubscription: true,
        editSubscriptionId: "sub-1",
        generatedYaml: "mixed-port: 7890",
        generatedYamlError: null,
        configLoading: true,
        hasValidSources: true,
        handleGenerate,
        handleDownload,
        subscription,
        onConfigImport,
        onConfigExport,
      })
    );

    expect(mocks.tabs[0]).toMatchObject({ value: "advanced" });
    mocks.tabs[0].onValueChange("quick");
    expect(mocks.interactions.modeChanged).toHaveBeenCalledWith({ mode: "quick" });
    expect(mocks.yamlHighlight).toMatchObject({ content: "mixed-port: 7890" });

    mocks.buttons[0].onClick();
    mocks.buttons[1].onClick();
    mocks.buttons[2].onClick();
    mocks.buttons[3].onClick();
    mocks.buttons[4].onClick();
    mocks.buttons[5].onClick();

    expect(handleGenerate).toHaveBeenCalledWith("advanced");
    expect(onConfigImport).toHaveBeenCalled();
    expect(onConfigExport).toHaveBeenCalled();
    expect(handleDownload).toHaveBeenCalledWith("advanced");
    expect(subscription.handleGenerateSubscription).toHaveBeenCalledWith("advanced");
    expect(mocks.subscriptionDialog).toMatchObject({
      open: true,
      subscriptionUrl: "https://example.com/sub",
      isEditingExistingSubscription: true,
      autoUpdatePolicy: {
        defaultHours: 24,
        minHours: 12,
        stepHours: 1,
        requireIntegerHours: true,
      },
    });
  });

  it("renders generated YAML errors instead of the preview highlighter", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomeLayout, {
        ...baseProps,
        generatedYaml: "bad yaml",
        generatedYamlError: "dns is invalid",
        hasValidSources: true,
      })
    );

    expect(html).toContain("基础和 DNS 配置有错误");
    expect(html).toContain("dns is invalid");
    expect(mocks.yamlHighlight).toBeUndefined();
  });
});
