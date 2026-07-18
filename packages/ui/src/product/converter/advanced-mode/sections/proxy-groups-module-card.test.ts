import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProxyGroupModule } from "@subboost/core/generator/proxy-groups";

const mocks = vi.hoisted(() => ({
  buttons: [] as any[],
  effectiveRules: [] as any[],
  excludedIds: new Set<string>(),
  inputs: [] as any[],
  movedRuleIds: new Set<string>(),
  panels: [] as any[],
  switches: [] as any[],
}));

vi.mock("@radix-ui/react-popover", () => ({
  Anchor: (props: any) => React.createElement("span", null, props.children),
  Arrow: () => null,
  Content: ({ align, children, className, side }: any) => React.createElement("div", { align, className, side }, children),
  Close: (props: any) => React.createElement("button", null, props.children),
  Portal: (props: any) => React.createElement("div", null, props.children),
  Root: (props: any) => React.createElement("div", null, props.children),
  Trigger: (props: any) => React.createElement("div", null, props.children),
}));

vi.mock("lucide-react", () => ({
  Check: () => React.createElement("span", null, "check-icon"),
  ChevronDown: () => React.createElement("span", null, "down-icon"),
  ChevronRight: () => React.createElement("span", null, "right-icon"),
  HelpCircle: () => React.createElement("span", null, "help-icon"),
  Pencil: () => React.createElement("span", null, "pencil-icon"),
  Shuffle: () => React.createElement("span", null, "shuffle-icon"),
  SlidersHorizontal: () => React.createElement("span", null, "sliders-icon"),
  Trash2: () => React.createElement("span", null, "trash-icon"),
  X: () => React.createElement("span", null, "x-icon"),
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.buttons.push(props);
    return React.createElement("button", props, props.children);
  },
}));

vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.inputs.push(props);
    return React.createElement("input", props);
  },
}));

vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => {
    mocks.switches.push(props);
    return React.createElement("input", { type: "checkbox", checked: props.checked, onChange: props.onCheckedChange });
  },
}));

vi.mock("@subboost/core/generator/module-rules", () => ({
  getEffectiveModuleRuleItems: () => mocks.effectiveRules,
  getExcludedModuleRuleIds: () => mocks.excludedIds,
  isModuleRuleMovedFrom: (_moduleId: string, ruleId: string) => mocks.movedRuleIds.has(ruleId),
}));

vi.mock("@subboost/ui/lib/utils", () => ({
  cn: (...parts: unknown[]) => parts.filter(Boolean).join(" "),
}));

vi.mock("./proxy-groups-module-rules-panel", () => ({
  ProxyGroupsModuleRulesPanel: (props: any) => {
    mocks.panels.push(props);
    return React.createElement("div", null, "rules-panel");
  },
}));

import { ProxyGroupsModuleCard } from "./proxy-groups-module-card";

type ModuleCardProps = React.ComponentProps<typeof ProxyGroupsModuleCard>;

const baseModule: ProxyGroupModule = {
  id: "gemini",
  name: "Gemini",
  emoji: "🤖",
  category: "service",
  description: "AI description",
  groupType: "select",
  rules: [
    { id: "rule-1", name: "Rule 1", behavior: "domain", path: "geosite/rule-1.mrs" },
    { id: "rule-2", name: "Rule 2", behavior: "domain", path: "geosite/rule-2.mrs" },
  ],
};

function props(overrides: Partial<ModuleCardProps> = {}): ModuleCardProps {
  return {
    module: baseModule,
    display: { full: "Gemini Display" },
    isCore: false,
    isEnabled: true,
    onToggleEnabled: vi.fn(),
    isEditing: false,
    editingName: "Gemini Draft",
    onChangeEditingName: vi.fn(),
    onStartEditing: vi.fn(),
    onCancelEditing: vi.fn(),
    onCommitEditing: vi.fn(),
    onHide: vi.fn(),
    extraRules: [{ id: "extra", name: "Extra", behavior: "domain" as const, path: "geosite/extra.mrs" }],
    ruleSetsByTarget: {},
    hiddenPresetRuleIds: {},
    customProxyGroups: [],
    manualRules: [{ index: 0, rule: { id: "manual-1", type: "DOMAIN" as const, value: "example.com", target: "Proxy" } }],
    manualRuleTargets: [{ kind: "module" as const, id: "gemini", name: "Gemini Display" }],
    enabledProxyGroups: ["gemini"],
    hiddenProxyGroups: [],
    proxyGroupNameOverrides: {},
    moduleRuleEditWarningAccepted: false,
    acceptModuleRuleEditWarning: vi.fn(),
    isRulesExpanded: true,
    onToggleRulesExpanded: vi.fn(),
    onAddRules: vi.fn(),
    onAddRulesToModule: vi.fn(),
    onAddRuleToCustomGroup: vi.fn(),
    onRemoveExtraRule: vi.fn(),
    onMoveRule: vi.fn(),
    onMoveManualRule: vi.fn(),
    onRemoveManualRule: vi.fn(),
    onRestoreRule: vi.fn(),
    onResetRuleTarget: vi.fn(),
    cnIpNoResolve: true,
    onChangeCnIpNoResolve: vi.fn(),
    experimentalCnUseCnRuleSet: false,
    onChangeExperimentalCnUseCnRuleSet: vi.fn(),
    ...overrides,
  };
}

describe("ProxyGroupsModuleCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buttons = [];
    mocks.effectiveRules = [{ id: "effective-1" }, { id: "effective-2" }];
    mocks.excludedIds = new Set(["rule-1", "rule-2"]);
    mocks.inputs = [];
    mocks.movedRuleIds = new Set(["rule-1"]);
    mocks.panels = [];
    mocks.switches = [];
  });

  it("renders expanded module state and forwards header actions", () => {
    const handlers = props();
    const html = renderToStaticMarkup(React.createElement(ProxyGroupsModuleCard, handlers));

    expect(html).toContain("Gemini Display");
    expect(html).toContain("AI description");
    expect(html).toContain("3 规则");
    expect(html).toContain("Gemini 分流说明");
    expect(html).toContain("rules-panel");
    expect(mocks.panels[0]).toEqual(expect.objectContaining({ module: baseModule, cnIpNoResolve: true }));
    expect(html).toContain('aria-label="收起 Gemini Display"');
    expect(html).toContain('aria-expanded="true"');

    capturesClick(html);
    mocks.buttons.find((button) => button.title === "改名").onClick({ stopPropagation: vi.fn() });
    mocks.buttons.find((button) => button.title === "删除").onClick({ stopPropagation: vi.fn() });
    mocks.switches[0].onCheckedChange(false);

    expect(handlers.onStartEditing).toHaveBeenCalled();
    expect(handlers.onHide).toHaveBeenCalled();
    expect(handlers.onToggleEnabled).toHaveBeenCalledWith(false);
  });

  it("handles editing input changes, keyboard commits, and cancel buttons", () => {
    const handlers = props({ isEditing: true, isRulesExpanded: false });
    renderToStaticMarkup(React.createElement(ProxyGroupsModuleCard, handlers));

    capturesClick("");
    const nameInput = mocks.inputs.find((input) => input.autoFocus);
    expect(nameInput).toEqual(expect.objectContaining({ value: "Gemini Draft", autoFocus: true }));
    nameInput.onChange({ target: { value: "New Name" } });
    nameInput.onKeyDown({ key: "Enter" });
    nameInput.onKeyDown({ key: "Escape" });
    mocks.buttons.at(-2).onClick();
    mocks.buttons.at(-1).onClick();

    expect(handlers.onChangeEditingName).toHaveBeenCalledWith("🤖 New Name");
    expect(handlers.onCommitEditing).toHaveBeenCalledTimes(2);
    expect(handlers.onCancelEditing).toHaveBeenCalledTimes(2);
    expect(mocks.panels).toHaveLength(0);
  });

  it("handles optional description editing and advanced rule rendering", () => {
    const onChangeEditingDescription = vi.fn();
    const editingHandlers = props({
      isEditing: true,
      editingDescription: "Draft description",
      onChangeEditingDescription,
      isRulesExpanded: false,
    });
    renderToStaticMarkup(React.createElement(ProxyGroupsModuleCard, editingHandlers));

    const descriptionInput = mocks.inputs.find(
      (input) => input.placeholder === "描述文本（默认: 自定义代理组）",
    );
    expect(descriptionInput).toEqual(
      expect.objectContaining({ value: "Draft description" }),
    );
    descriptionInput.onChange({ target: { value: "Updated description" } });
    descriptionInput.onKeyDown({ key: "Enter" });
    descriptionInput.onKeyDown({ key: "Escape" });
    expect(onChangeEditingDescription).toHaveBeenCalledWith("Updated description");
    expect(editingHandlers.onCommitEditing).toHaveBeenCalled();
    expect(editingHandlers.onCancelEditing).toHaveBeenCalled();

    mocks.inputs = [];
    const onChangeEmptyDescription = vi.fn();
    const emptyDescriptionHandlers = props({
      isEditing: true,
      onChangeEditingDescription: onChangeEmptyDescription,
      isRulesExpanded: false,
    });
    renderToStaticMarkup(
      React.createElement(ProxyGroupsModuleCard, emptyDescriptionHandlers),
    );
    expect(
      mocks.inputs.find(
        (input) => input.placeholder === "描述文本（默认: 自定义代理组）",
      ).value,
    ).toBe("");

    const renderAdvancedContent = vi.fn((rulesContent, rulesCount) =>
      React.createElement("section", null, "advanced-", rulesCount, rulesContent),
    );
    const html = renderToStaticMarkup(
      React.createElement(
        ProxyGroupsModuleCard,
        props({
          advancedMode: true,
          renderAdvancedContent,
          rulesContentOverride: React.createElement("span", null, "override rules"),
          rulesCountOverride: 5,
        })
      )
    );

    expect(renderAdvancedContent).toHaveBeenCalledWith(expect.anything(), 5);
    expect(html).toContain("advanced-5");
    expect(html).toContain("override rules");
  });

  it("renders google scholar hint and hides optional controls for core modules", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ProxyGroupsModuleCard,
        props({
          module: { ...baseModule, id: "google-scholar", description: "Scholar description", rules: [] },
          display: { full: "Google Scholar" },
          isCore: true,
          extraRules: [],
          manualRules: [],
          isRulesExpanded: false,
        })
      )
    );

    expect(html).toContain("谷歌学术分流说明");
    expect(html).toContain("Scholar description");
    expect(mocks.buttons.some((button) => button.title === "改名")).toBe(false);
    expect(mocks.panels).toHaveLength(0);
  });

  it("keeps the full module header as the disclosure control", () => {
    const collapsedHandlers = props({ isRulesExpanded: false });
    const collapsedHtml = renderToStaticMarkup(
      React.createElement(ProxyGroupsModuleCard, collapsedHandlers),
    );

    expect(collapsedHtml).toContain('class="absolute inset-0');
    expect(collapsedHtml).toContain('aria-label="展开 Gemini Display"');
    expect(collapsedHtml).toContain('aria-expanded="false"');
  });

  it("renders module summary with the requested description and rule colors", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ProxyGroupsModuleCard,
        props({
          module: { ...baseModule, id: "manual", description: "手动选择代理节点" },
          display: { full: "手动选择" },
        })
      )
    );

    expect(html).toContain("手动选择代理节点");
    expect(html).toContain('text-indigo-300">手动选择代理节点');
    expect(html).toContain('text-emerald-300">3 规则');
    expect(html).not.toContain('title="手动选择代理节点');
    expect(html).not.toContain('title="3 规则');

    const overrideHtml = renderToStaticMarkup(
      React.createElement(
        ProxyGroupsModuleCard,
        props({
          description: "Override description",
          module: { ...baseModule, description: undefined as never },
          display: { full: "Override" },
        })
      )
    );
    expect(overrideHtml).toContain("Override description");

    const emptyDescriptionHtml = renderToStaticMarkup(
      React.createElement(
        ProxyGroupsModuleCard,
        props({
          extraRules: [],
          manualRules: [],
          module: { ...baseModule, description: undefined as never, rules: [] },
          rulesContentOverride: null,
          rulesCountOverride: 0,
        })
      )
    );
    expect(emptyDescriptionHtml).toContain("0 规则");
    expect(emptyDescriptionHtml).not.toContain("AI description");
  });
});

function capturesClick(_html: string) {
  // Render-to-static-markup cannot expose native div props; button/switch callbacks are captured by mocks above.
}
