import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any[]>,
  store: {} as Record<string, any>,
  interactions: {
    ruleAdded: vi.fn(),
  },
  createCustomRuleId: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  callIndex: 0,
  enabled: false,
  overrides: {} as Record<number, unknown>,
  runEffects: false,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: React.EffectCallback, deps?: React.DependencyList) => {
      if (stateMock.enabled && stateMock.runEffects) {
        effect();
        return;
      }
      return actual.useEffect(effect, deps);
    },
    useState: (initial: unknown) => {
      if (!stateMock.enabled) return actual.useState(initial);
      const index = stateMock.callIndex++;
      const value = Object.prototype.hasOwnProperty.call(
        stateMock.overrides,
        index,
      )
        ? stateMock.overrides[index]
        : initial;
      const setter = vi.fn((next: unknown) => {
        const resolved =
          typeof next === "function"
            ? (next as (prev: unknown) => unknown)(value)
            : next;
        (setter as any).lastValue = resolved;
        return resolved;
      });
      stateMock.setters[index] = setter;
      return [value, setter];
    },
  };
});

vi.mock("lucide-react", () => ({
  ArrowRight: () => null,
  Check: () => null,
  Pencil: () => null,
  Trash2: () => null,
  X: () => null,
}));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    return React.createElement("button", props, props.children);
  },
}));
vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.captures.inputs.push(props);
    return React.createElement("input", {
      value: props.value,
      onChange: props.onChange,
      placeholder: props.placeholder,
    });
  },
}));
vi.mock("@subboost/ui/components/ui/select", () => ({
  Select: (props: any) => {
    mocks.captures.selects.push(props);
    return React.createElement("select", null, props.children);
  },
  SelectContent: (props: any) =>
    React.createElement(React.Fragment, null, props.children),
  SelectItem: (props: any) =>
    React.createElement("option", { value: props.value }, props.children),
  SelectTrigger: (props: any) => {
    mocks.captures.selectTriggers.push(props);
    return React.createElement(
      "span",
      { className: props.className },
      props.children,
    );
  },
  SelectValue: () => React.createElement("span"),
}));
vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => {
    mocks.captures.switches.push(props);
    return React.createElement("button", {
      type: "button",
      "aria-pressed": props.checked,
    });
  },
}));
vi.mock("@subboost/core/generator/proxy-groups", () => ({
  PROXY_GROUP_MODULES: [
    { id: "auto", name: "Auto" },
    { id: "fallback", name: "Fallback" },
  ],
}));
vi.mock("@subboost/core/proxy-group-name", () => ({
  resolveProxyGroupModuleName: (
    module: { name: string; id: string },
    override?: string,
  ) => override || module.name,
}));
vi.mock("@subboost/core/rules/custom-rule-utils", () => ({
  CUSTOM_RULE_TYPES: [
    "DOMAIN",
    "DOMAIN-SUFFIX",
    "DOMAIN-KEYWORD",
    "IP-CIDR",
    "IP-CIDR6",
    "GEOIP",
    "GEOSITE",
    "PROCESS-NAME",
    "DST-PORT",
    "SRC-PORT",
  ],
  createCustomRuleId: mocks.createCustomRuleId,
}));
vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: () => mocks.store,
}));
vi.mock("@subboost/ui/product/interactions", () => ({
  useProductInteractionAdapter: () => mocks.interactions,
}));
vi.mock("./proxy-groups-custom-rules-batch-dialog", () => ({
  ProxyGroupsCustomRulesBatchDialog: (props: any) => {
    mocks.captures.batchDialogs.push(props);
    return null;
  },
}));

import { ProxyGroupsCustomRules } from "./proxy-groups-custom-rules";
import {
  RULE_ADD_ROW_FRAME_CLASS,
  RULE_EDIT_ACTIONS_CLASS,
  RULE_EDIT_PRIMARY_FIELD_CLASS,
  RULE_EDIT_PRIMARY_GROUP_CLASS,
  RULE_EDIT_ROW_CLASS,
  RULE_EDIT_TARGET_SELECT_TRIGGER_CLASS,
  RULE_EDIT_TRAILING_CONTROLS_CLASS,
  RULE_HEADER_ACTION_BUTTON_CLASS,
  RULE_HEADER_ROW_CLASS,
  RULE_TEXT_ACTION_BUTTON_CLASS,
} from "./proxy-groups-rule-editor-layout";

function renderRules(
  overrides: Record<number, unknown> = {},
  options: { runEffects?: boolean } = {},
) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.runEffects = Boolean(options.runEffects);
  stateMock.setters = [];
  mocks.captures = {
    batchDialogs: [],
    buttons: [],
    inputs: [],
    selects: [],
    selectTriggers: [],
    switches: [],
  };
  try {
    const html = renderToStaticMarkup(
      React.createElement(ProxyGroupsCustomRules),
    );
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
    stateMock.runEffects = false;
  }
}

function renderNode(node: React.ReactNode) {
  return renderToStaticMarkup(React.createElement(React.Fragment, null, node));
}

describe("ProxyGroupsCustomRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captures = {
      batchDialogs: [],
      buttons: [],
      inputs: [],
      selects: [],
      selectTriggers: [],
      switches: [],
    };
    mocks.createCustomRuleId.mockReturnValue("custom-rule-1");
    mocks.store = {
      customRules: [],
      addCustomRule: vi.fn(),
      addCustomRules: vi.fn(),
      updateCustomRule: vi.fn(),
      removeCustomRule: vi.fn(),
      enabledProxyGroups: ["auto"],
      customProxyGroups: [{ id: "custom-1", name: "Custom Group", rules: [] }],
      filteredProxyGroups: [
        { name: " Filter Group ", enabled: true },
        { name: "Disabled", enabled: false },
        { name: "   ", enabled: true },
        { name: 123, enabled: true },
      ],
      proxyGroupNameOverrides: { auto: "节点选择" },
    };
  });

  it("builds add and batch-import controls from enabled targets", () => {
    const { html, setters } = renderRules({
      1: " google.com ",
      2: "Legacy Target",
      3: true,
    });

    expect(renderNode(mocks.captures.selectTriggers[0].children)).toContain(
      "域名",
    );
    expect(renderNode(mocks.captures.selectTriggers[0].children)).not.toContain(
      "DOMAIN",
    );
    expect(html).toContain("域名 (DOMAIN)");
    expect(mocks.captures.selectTriggers[0].className).toContain("w-[112px]");
    expect(RULE_TARGET_SELECT_TRIGGER_CLASS).toContain("w-[120px]");
    expect(RULE_EDIT_ROW_CLASS).toContain(
      "proxy-group-custom-rule-editor-row",
    );
    expect(RULE_EDIT_PRIMARY_FIELD_CLASS).toContain("flex-[999_1_11rem]");
    expect(mocks.captures.selectTriggers[1].className).toBe(
      RULE_EDIT_TARGET_SELECT_TRIGGER_CLASS,
    );
    expect(html).toContain(RULE_ADD_ROW_FRAME_CLASS);
    expect(html).toContain(RULE_HEADER_ROW_CLASS);
    expect(html).toContain(RULE_EDIT_PRIMARY_GROUP_CLASS);
    expect(html).toContain(RULE_EDIT_TRAILING_CONTROLS_CLASS);
    expect(RULE_EDIT_TRAILING_CONTROLS_CLASS).toContain(
      "proxy-group-custom-rule-editor-trailing",
    );
    expect(RULE_EDIT_TRAILING_CONTROLS_CLASS).toContain("grid");
    expect(RULE_EDIT_TRAILING_CONTROLS_CLASS).not.toContain("flex-wrap");
    expect(RULE_EDIT_TARGET_SELECT_TRIGGER_CLASS).toContain(
      "proxy-group-custom-rule-editor-target",
    );
    expect(
      mocks.captures.buttons.find((props) => props.children === "添加规则")
        .className,
    ).toBe(RULE_TEXT_ACTION_BUTTON_CLASS);
    expect(
      mocks.captures.buttons.find((props) => props.children === "批量导入")
        .className,
    ).toBe(RULE_HEADER_ACTION_BUTTON_CLASS);
    expect(RULE_TEXT_ACTION_BUTTON_CLASS).toContain("w-[92px]");
    expect(RULE_HEADER_ACTION_BUTTON_CLASS).toContain("w-[92px]");

    expect(mocks.captures.batchDialogs[0]).toEqual(
      expect.objectContaining({
        open: false,
        defaultType: "DOMAIN",
        defaultTarget: "Legacy Target",
        defaultNoResolve: true,
        targetOptions: [
          "DIRECT",
          "REJECT",
          "节点选择",
          "Custom Group",
          "Filter Group",
          "Legacy Target",
        ],
        existingRules: [],
        onImport: mocks.store.addCustomRules,
      }),
    );

    mocks.captures.buttons
      .find((props) => props.children === "批量导入")
      .onClick();
    expect(setters[4]).toHaveBeenCalledWith(true);

    mocks.captures.inputs[0].onChange({ target: { value: "example.com" } });
    expect(setters[1]).toHaveBeenCalledWith("example.com");
    mocks.captures.selects[0].onValueChange("IP-CIDR");
    expect(setters[0]).toHaveBeenCalledWith("IP-CIDR");
    expect(setters[3]).toHaveBeenCalledWith(true);
    mocks.captures.selects[1].onValueChange("DIRECT");
    expect(setters[2]).toHaveBeenCalledWith("DIRECT");
    mocks.captures.switches[0].onCheckedChange(false);
    expect(setters[3]).toHaveBeenCalledWith(false);
  });

  it.each([
    ["DOMAIN", "domain"],
    ["IP-CIDR", "ipcidr"],
    ["IP-CIDR6", "ipcidr"],
    ["GEOIP", "geo"],
    ["PROCESS-NAME", "process"],
    ["DST-PORT", "port"],
  ] as const)(
    "adds a %s rule and records the product interaction kind",
    (type, kind) => {
      const { setters } = renderRules({ 0: type, 1: " value ", 2: "DIRECT", 3: true });

      mocks.captures.buttons
        .find((props) => props.children === "添加规则")
        .onClick();

      expect(mocks.store.addCustomRule).toHaveBeenCalledWith({
        id: "custom-rule-1",
        type,
        value: "value",
        target: "DIRECT",
        noResolve: true,
      });
      expect(mocks.interactions.ruleAdded).toHaveBeenCalledWith({
        source: "manual",
        kind,
      });
      expect(setters[3]).toHaveBeenCalledWith(type.startsWith("IP-CIDR"));
    },
  );

  it("renders existing rules and saves, cancels, or deletes an editing draft", () => {
    mocks.store.customRules = [
      {
        id: "rule-1",
        type: "DOMAIN",
        value: "old.com",
        target: "DIRECT",
        noResolve: false,
      },
      {
        id: "rule-2",
        type: "IP-CIDR",
        value: "10.0.0.0/8",
        target: "Custom Group",
        noResolve: true,
      },
    ];
    const draft = {
      id: "rule-1",
      type: "DOMAIN" as const,
      value: " edited.com ",
      target: "Custom Group",
      noResolve: true,
    };
    const { html, setters } = renderRules({
      5: "rule-1",
      6: draft,
    });

    expect(html).toContain("已添加 2");
    expect(renderNode(mocks.captures.selectTriggers[2].children)).toContain(
      "域名",
    );
    expect(renderNode(mocks.captures.selectTriggers[2].children)).not.toContain(
      "DOMAIN",
    );
    expect(mocks.captures.selectTriggers[2].className).toContain("w-[112px]");
    expect(html).toContain(RULE_EDIT_PRIMARY_GROUP_CLASS);
    expect(RULE_EDIT_PRIMARY_GROUP_CLASS).not.toContain("flex-wrap");
    expect(RULE_EDIT_PRIMARY_FIELD_CLASS).toContain("min-w-[min(9rem,100%)]");
    expect(html).toContain(RULE_EDIT_TRAILING_CONTROLS_CLASS);
    expect(RULE_EDIT_TARGET_SELECT_TRIGGER_CLASS).toContain(
      "proxy-group-custom-rule-editor-target",
    );
    expect(mocks.captures.selectTriggers[3].className).toBe(
      RULE_EDIT_TARGET_SELECT_TRIGGER_CLASS,
    );
    expect(html).toContain(RULE_EDIT_ACTIONS_CLASS);
    expect(RULE_EDIT_ACTIONS_CLASS).toContain("w-[92px]");
    expect(mocks.captures.selects[2].value).toBe("DOMAIN");
    mocks.captures.selects[2].onValueChange("DOMAIN-SUFFIX");
    expect((setters[6] as any).lastValue).toEqual(
      expect.objectContaining({ type: "DOMAIN-SUFFIX" }),
    );
    mocks.captures.inputs[1].onChange({ target: { value: "next.com" } });
    expect((setters[6] as any).lastValue).toEqual(
      expect.objectContaining({ value: "next.com" }),
    );
    mocks.captures.selects[3].onValueChange("REJECT");
    expect((setters[6] as any).lastValue).toEqual(
      expect.objectContaining({ target: "REJECT" }),
    );
    mocks.captures.switches[1].onCheckedChange(false);
    expect((setters[6] as any).lastValue).toEqual(
      expect.objectContaining({ noResolve: false }),
    );
    const draftUpdaters = setters[6].mock.calls
      .map((call) => call[0])
      .filter(
        (value): value is (prev: unknown) => unknown =>
          typeof value === "function",
      );
    expect(draftUpdaters.map((updater) => updater(null))).toEqual([
      null,
      null,
      null,
      null,
    ]);

    mocks.captures.buttons
      .find((props) => props.title === "保存规则")
      .onClick();
    expect(mocks.store.updateCustomRule).toHaveBeenCalledWith("rule-1", {
      type: "DOMAIN",
      value: "edited.com",
      target: "Custom Group",
      noResolve: true,
    });
    expect(setters[5]).toHaveBeenCalledWith(null);
    expect(setters[6]).toHaveBeenCalledWith(null);

    mocks.captures.buttons
      .find((props) => props.title === "取消编辑")
      .onClick();
    expect(setters[5]).toHaveBeenCalledWith(null);

    mocks.captures.buttons
      .find((props) => props.title === "删除规则")
      .onClick();
    expect(mocks.store.removeCustomRule).toHaveBeenCalledWith(0);
  });

  it("ignores incomplete additions, records unknown rule kinds, and exits stale edits", () => {
    renderRules({ 1: "   ", 2: "DIRECT" });
    mocks.captures.buttons
      .find((props) => props.children === "添加规则")
      .onClick();
    expect(mocks.store.addCustomRule).not.toHaveBeenCalled();

    renderRules({ 1: "value", 2: "" });
    mocks.captures.buttons
      .find((props) => props.children === "添加规则")
      .onClick();
    expect(mocks.store.addCustomRule).not.toHaveBeenCalled();
    expect(mocks.captures.batchDialogs[0].targetOptions).toEqual([
      "DIRECT",
      "REJECT",
      "节点选择",
      "Custom Group",
      "Filter Group",
    ]);

    renderRules({ 0: "RULE-SET" as any, 1: " rule.mrs ", 2: "DIRECT" });
    mocks.captures.buttons
      .find((props) => props.children === "添加规则")
      .onClick();
    expect(mocks.store.addCustomRule).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "RULE-SET",
        value: "rule.mrs",
      }),
    );
    expect(mocks.interactions.ruleAdded).toHaveBeenCalledWith({
      source: "manual",
      kind: "unknown",
    });

    const stale = renderRules(
      {
        5: "missing-rule",
        6: {
          id: "missing-rule",
          type: "DOMAIN",
          value: "example.com",
          target: "DIRECT",
          noResolve: false,
        },
      },
      { runEffects: true },
    );
    expect(stale.setters[5]).toHaveBeenCalledWith(null);
    expect(stale.setters[6]).toHaveBeenCalledWith(null);

    const noEditing = renderRules({}, { runEffects: true });
    expect(noEditing.setters[5]).not.toHaveBeenCalled();
    expect(noEditing.setters[6]).not.toHaveBeenCalled();

    mocks.store.customRules = [
      {
        id: "rule-1",
        type: "DOMAIN",
        value: "old.com",
        target: "DIRECT",
        noResolve: false,
      },
    ];
    const currentEdit = renderRules(
      {
        5: "rule-1",
        6: {
          id: "rule-1",
          type: "DOMAIN",
          value: "old.com",
          target: "DIRECT",
          noResolve: false,
        },
      },
      { runEffects: true },
    );
    expect(currentEdit.setters[5]).not.toHaveBeenCalledWith(null);
    expect(currentEdit.setters[6]).not.toHaveBeenCalledWith(null);
  });

  it("keeps invalid edit drafts unsaved", () => {
    mocks.store.customRules = [
      {
        id: "rule-1",
        type: "DOMAIN",
        value: "old.com",
        target: "DIRECT",
        noResolve: false,
      },
    ];

    renderRules({
      5: "rule-1",
      6: {
        id: "rule-1",
        type: "DOMAIN",
        value: "   ",
        target: "DIRECT",
        noResolve: false,
      },
    });
    mocks.captures.buttons
      .find((props) => props.title === "保存规则")
      .onClick();
    expect(mocks.store.updateCustomRule).not.toHaveBeenCalled();

    renderRules({
      5: "rule-1",
      6: {
        id: "rule-1",
        type: "DOMAIN",
        value: "example.com",
        target: "",
        noResolve: false,
      },
    });
    mocks.captures.buttons
      .find((props) => props.title === "保存规则")
      .onClick();
    expect(mocks.store.updateCustomRule).not.toHaveBeenCalled();
  });
});
