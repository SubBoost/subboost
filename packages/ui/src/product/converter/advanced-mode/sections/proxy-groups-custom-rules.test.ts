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
  toast: vi.fn(),
  rulesApi: undefined as import("@subboost/ui/product/api-adapter").ProductRulesApi | undefined,
}));
vi.mock("@subboost/ui/product/api-adapter", () => ({ useProductApiAdapter: () => ({ rules: mocks.rulesApi }) }));

const stateMock = vi.hoisted(() => ({
  callIndex: 0,
  enabled: false,
  overrides: {} as Record<number, unknown>,
  runEffects: false,
  cleanups: [] as Array<() => void>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: React.EffectCallback, deps?: React.DependencyList) => {
      if (stateMock.enabled && stateMock.runEffects) {
        const cleanup = effect();
        if (cleanup) stateMock.cleanups.push(cleanup);
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
    { id: "auto", name: "Auto", rules: [] },
    { id: "fallback", name: "Fallback", rules: [] },
  ],
}));
vi.mock("@subboost/core/proxy-group-name", () => ({
  resolveProxyGroupModuleName: (
    module: { name: string; id: string },
    override?: string,
  ) => override || module.name,
}));
vi.mock("@subboost/core/rules/custom-rule-utils", async (importOriginal) => ({
  ...await importOriginal<typeof import("@subboost/core/rules/custom-rule-utils")>(),
  createCustomRuleId: mocks.createCustomRuleId,
}));
vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: () => mocks.store,
}));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
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
import { CUSTOM_RULE_TYPES, getCustomRuleDefinition, supportsNoResolve } from "@subboost/core/rules/custom-rule-types";
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
  RULE_TARGET_SELECT_TRIGGER_CLASS,
  RULE_TEXT_ACTION_BUTTON_CLASS,
  RULE_TYPE_BADGE_CLASS,
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
    mocks.rulesApi = undefined;
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
      addModuleRules: vi.fn(),
      addCustomRules: vi.fn(),
      updateCustomRule: vi.fn(),
      removeCustomRule: vi.fn(),
      enabledProxyGroups: ["auto"],
      customProxyGroups: [{ id: "custom-1", name: "Custom Group", rules: [] }],
      proxyGroupNameOverrides: { auto: "节点选择" },
    };
  });

  it("adds a remote rule set using the existing input and automatically derived name", () => {
    const url = "https://github.com/MetaCubeX/meta-rules-dat/raw/refs/heads/meta/geo/geosite/udemy.mrs";
    const { html, setters } = renderRules({ 0: "RULE-SET", 1: url, 2: "Custom Group" });
    expect(html).toContain("规则集 (RULE-SET)");
    expect(mocks.captures.inputs).toHaveLength(1);
    mocks.captures.buttons.find((button) => button.children === "添加规则").onClick();
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith("custom-1", [expect.objectContaining({
      name: "udemy", path: url, behavior: "domain", id: "udemy",
    })]);
    expect(mocks.store.addCustomRule).not.toHaveBeenCalled();
    expect(setters[1]).toHaveBeenCalledWith("");
    expect(mocks.captures.batchDialogs[0].defaultType).toBe("RULE-SET");
  });

  it("detects remote text/yaml once and preserves input until successful completion", async () => {
    const url = "https://local.subboost.test/remote.txt";
    let resolve!: (value: any) => void;
    const detectRuleSet = vi.fn(() => new Promise<any>((done) => { resolve = done; }));
    mocks.rulesApi = { detectRuleSet };
    const { setters } = renderRules({ 0: "RULE-SET", 1: url, 2: "Custom Group" });
    const add = mocks.captures.buttons.find((button) => button.children === "添加规则").onClick;
    add(); add();
    expect(detectRuleSet).toHaveBeenCalledTimes(1);
    expect(setters[1]).not.toHaveBeenCalled();
    resolve({ name: "remote", path: url, format: "yaml", behavior: "classical" });
    await vi.waitFor(() => expect(mocks.store.addModuleRules).toHaveBeenCalledWith("custom-1", [expect.objectContaining({ path: url, format: "yaml", behavior: "classical" })]));
    expect(setters[1]).toHaveBeenCalledWith("");
  });

  it("keeps the URL when remote detection fails", async () => {
    mocks.rulesApi = { detectRuleSet: vi.fn().mockRejectedValue(new Error("无法识别规则文件")) };
    const { setters } = renderRules({ 0: "RULE-SET", 1: "https://local.subboost.test/error", 2: "Custom Group" });
    mocks.captures.buttons.find((button) => button.children === "添加规则").onClick();
    await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "无法识别规则文件" })));
    expect(mocks.store.addModuleRules).not.toHaveBeenCalled();
    expect(setters[1]).not.toHaveBeenCalled();
  });

  it("ignores a late detection result after the draft effect is cleaned up", async () => {
    const url = "https://local.subboost.test/pending";
    let resolve!: (value: any) => void;
    const detectRuleSet = vi.fn(() => new Promise<any>((done) => { resolve = done; }));
    mocks.rulesApi = { detectRuleSet };
    stateMock.cleanups = [];
    const { setters } = renderRules({ 0: "RULE-SET", 1: url, 2: "Custom Group" }, { runEffects: true });
    mocks.captures.buttons.find((button) => button.children === "添加规则").onClick();
    for (const cleanup of stateMock.cleanups) cleanup();
    expect((detectRuleSet.mock.calls[0] as any)[0].signal.aborted).toBe(true);
    resolve({ name: "pending", path: url, format: "text", behavior: "domain" });
    await new Promise((done) => setTimeout(done, 0));
    expect(mocks.store.addModuleRules).not.toHaveBeenCalled();
    expect(setters[1]).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("suffixes existing provider names and imports provider batches into their selected group", () => {
    mocks.store.customRuleSets = [{ id: "udemy", path: "geosite/udemy.mrs", target: { kind: "custom", id: "custom-1" } }];
    renderRules({ 0: "RULE-SET", 1: "https://local.subboost.test/geosite/udemy.mrs", 2: "Custom Group" });
    mocks.captures.buttons.find((button) => button.children === "添加规则").onClick();
    expect(mocks.store.addModuleRules).toHaveBeenCalledWith("custom-1", [expect.objectContaining({ id: "udemy-2", name: "udemy-2" })]);
    const batch = mocks.captures.batchDialogs[0];
    expect(batch.existingRuleSets[0].target).toBe("Custom Group");
    batch.onImportRuleSets([{ id: "udemy-3", name: "udemy-3", path: "geosite/udemy.mrs", target: "Custom Group", behavior: "domain" }]);
    expect(mocks.store.addModuleRules).toHaveBeenLastCalledWith("custom-1", [expect.objectContaining({ id: "udemy-3" })]);
  });

  it.each(["DIRECT", "REJECT"])("requires a proxy group for rule sets instead of %s", (target) => {
    const { setters } = renderRules({ 0: "RULE-SET", 1: "https://local.subboost.test/geosite/finance.mrs", 2: target });
    mocks.captures.buttons.find((button) => button.children === "添加规则").onClick();
    expect(mocks.store.addModuleRules).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "请选择规则集使用的代理组" }));
    mocks.captures.selects[0].onValueChange("RULE-SET");
    expect(setters[2]).toHaveBeenCalledWith("节点选择");
  });

  it("leaves no target when switching to rule sets with no available group", () => {
    mocks.store.enabledProxyGroups = [];
    mocks.store.customProxyGroups = [];
    const { setters } = renderRules({ 2: "DIRECT" });
    mocks.captures.selects[0].onValueChange("RULE-SET");
    expect(setters[2]).toHaveBeenCalledWith("");
  });

  it.each(["invalid", "https://local.subboost.test/geosite/finance.yaml"])("rejects unsupported rule-set input %s", (url) => {
    const { setters } = renderRules({ 0: "RULE-SET", 1: url, 2: "Custom Group" });
    mocks.captures.buttons.find((button) => button.children === "添加规则").onClick();
    expect(mocks.store.addModuleRules).not.toHaveBeenCalled();
    expect(setters[1]).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "warning" }));
  });

  it("reports an unexpected provider-add failure without clearing input", () => {
    mocks.store.addModuleRules.mockImplementationOnce(() => { throw "failed"; });
    const { setters } = renderRules({ 0: "RULE-SET", 1: "https://local.subboost.test/geosite/finance.mrs", 2: "Custom Group" });
    mocks.captures.buttons.find((button) => button.children === "添加规则").onClick();
    expect(setters[1]).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "规则集链接无效" }));
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
    expect(html).toContain("proxy-group-rule-no-resolve-label");
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
          "Legacy Target",
        ],
        existingRules: [],
        onImport: expect.any(Function),
      }),
    );
    mocks.captures.batchDialogs[0].onImport([
      { id: "batch-1", type: "DOMAIN", value: "batch.example", target: "Custom Group" },
    ]);
    expect(mocks.store.addCustomRules).toHaveBeenCalledWith([
      expect.objectContaining({ target: { kind: "custom", id: "custom-1" } }),
    ]);

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
        noResolve: supportsNoResolve(type),
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
      target: { kind: "custom", id: "custom-1" },
      noResolve: true,
    };
    const { html, setters } = renderRules({
      5: "rule-1",
      6: draft,
    });

    expect(html).toContain("已添加 2");
    expect(html).not.toContain(">自定义<");
    expect(html).toContain(RULE_TYPE_BADGE_CLASS);
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
      target: { kind: "custom", id: "custom-1" },
      noResolve: false,
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

  it("ignores incomplete additions and exits stale edits", () => {
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
    ]);

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

  it.each(CUSTOM_RULE_TYPES)("adds and edits %s using its example and applicable parameters", (type) => {
    const value = getCustomRuleDefinition(type).example;
    renderRules({ 0: type, 1: value, 2: "DIRECT", 3: true });
    expect(mocks.captures.inputs[0].placeholder).toContain(value);
    expect(mocks.captures.switches[0].disabled).toBe(!supportsNoResolve(type));
    mocks.captures.buttons.find((button) => button.children === "添加规则").onClick();
    expect(mocks.store.addCustomRule).toHaveBeenCalledWith(expect.objectContaining({ type, value, noResolve: supportsNoResolve(type) }));
    const rule = { id: "edit", type, value, target: "DIRECT", noResolve: true };
    mocks.store.customRules = [rule];
    renderRules({ 5: "edit", 6: rule });
    expect(mocks.captures.switches[1].disabled).toBe(!supportsNoResolve(type));
    mocks.captures.buttons.find((button) => button.title === "保存规则").onClick();
    expect(mocks.store.updateCustomRule).toHaveBeenCalledWith("edit", expect.objectContaining({ type, value, noResolve: supportsNoResolve(type) }));
  });

  it("keeps malformed logic drafts visible and reports the failure", () => {
    renderRules({ 0: "AND", 1: "((UNKNOWN,x))", 2: "DIRECT" });
    mocks.captures.buttons.find((button) => button.children === "添加规则").onClick();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "warning" }));
    expect(mocks.store.addCustomRule).not.toHaveBeenCalled();
    const rule = { id: "edit", type: "AND", value: "broken", target: "DIRECT" };
    mocks.store.customRules = [rule];
    renderRules({ 5: "edit", 6: rule });
    mocks.captures.buttons.find((button) => button.title === "保存规则").onClick();
    expect(mocks.store.updateCustomRule).not.toHaveBeenCalled();
  });

  it("shows an explicit fallback badge for unavailable existing targets", () => {
    mocks.store.customRules = [
      {
        id: "missing-target",
        type: "DOMAIN",
        value: "missing.example",
        target: { kind: "custom", id: "missing-1" },
        noResolve: false,
      },
      {
        id: "blank-target",
        type: "DOMAIN",
        value: "blank.example",
        target: "   ",
        noResolve: false,
      },
    ];

    const { html } = renderRules();

    expect(html.match(/>目标分流组不可用</g)).toHaveLength(2);
    expect(html).not.toContain('title=""');
  });
});
