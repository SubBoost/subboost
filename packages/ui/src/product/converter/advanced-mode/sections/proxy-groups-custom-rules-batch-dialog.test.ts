import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buttons: [] as any[],
  dialogs: [] as any[],
  textareas: [] as any[],
  interactions: {
    customRuleBatchImported: vi.fn(),
  },
  toast: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  enabled: false,
  callIndex: 0,
  overrides: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!stateMock.enabled) return actual.useState(initial);
      const index = stateMock.callIndex++;
      const value = Object.prototype.hasOwnProperty.call(stateMock.overrides, index)
        ? stateMock.overrides[index]
        : initial;
      const setter = vi.fn((next: unknown) => {
        const resolved =
          typeof next === "function" ? (next as (prev: unknown) => unknown)(value) : next;
        (setter as any).lastValue = resolved;
        return resolved;
      });
      stateMock.setters[index] = setter;
      return [value, setter];
    },
  };
});

vi.mock("lucide-react", () => ({
  AlertTriangle: () => React.createElement("span", null, "alert-icon"),
  ArrowRight: () => React.createElement("span", null, "arrow-icon"),
  Upload: () => React.createElement("span", null, "upload-icon"),
}));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.buttons.push(props);
    return React.createElement("button", props, props.children);
  },
}));
vi.mock("@subboost/ui/components/ui/dialog", () => ({
  Dialog: (props: any) => {
    mocks.dialogs.push(props);
    return React.createElement("div", null, props.children);
  },
  DialogContent: (props: any) => React.createElement("section", props, props.children),
  DialogHeader: (props: any) => React.createElement("header", props, props.children),
  DialogTitle: (props: any) => React.createElement("h2", props, props.children),
}));
vi.mock("@subboost/ui/components/ui/textarea", () => ({
  Textarea: (props: any) => {
    mocks.textareas.push(props);
    return React.createElement("textarea", props);
  },
}));
vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));
vi.mock("@subboost/ui/product/interactions", () => ({
  useProductInteractionAdapter: () => mocks.interactions,
}));

import { ProxyGroupsCustomRulesBatchDialog } from "./proxy-groups-custom-rules-batch-dialog";

function renderDialog(rawText = "", overrides: Record<string, unknown> = {}) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = { 0: rawText };
  stateMock.setters = [];
  mocks.buttons = [];
  mocks.dialogs = [];
  mocks.textareas = [];
  try {
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      defaultType: "DOMAIN-SUFFIX",
      defaultTarget: "Proxy",
      defaultNoResolve: false,
      targetOptions: ["Proxy", "DIRECT"],
      existingRules: [],
      onImport: vi.fn(),
      ...overrides,
    };
    const html = renderToStaticMarkup(
      React.createElement(ProxyGroupsCustomRulesBatchDialog, props as any),
    );
    return { html, props, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

describe("ProxyGroupsCustomRulesBatchDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders empty preview and resets text when closed", () => {
    const { html, props, setters } = renderDialog();

    expect(html).toContain("批量导入规则");
    expect(html).toContain("等待输入");
    expect(html).toContain("粘贴规则后会在这里预览。");
    expect(mocks.buttons.at(-1)).toEqual(expect.objectContaining({ disabled: true }));

    mocks.textareas[0].onChange({ target: { value: "github.com" } });
    mocks.buttons[0].onClick();
    mocks.dialogs[0].onOpenChange(true);
    mocks.dialogs[0].onOpenChange(false);

    expect(setters[0]).toHaveBeenCalledWith("github.com");
    expect(setters[0]).toHaveBeenCalledWith("");
    expect(props.onOpenChange).toHaveBeenCalledWith(true);
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("imports ready rules and records a success interaction", () => {
    const { html, props } = renderDialog(
      ["DOMAIN-SUFFIX,example.com,Proxy", "IP-CIDR,1.1.1.0/24,DIRECT,no-resolve"].join("\n"),
    );

    expect(html).toContain("可导入 2");
    expect(html).toContain("DOMAIN-SUFFIX");
    expect(html).toContain("no-resolve");

    mocks.buttons.at(-1).onClick();

    expect(props.onImport).toHaveBeenCalledWith([
      { id: "", type: "DOMAIN-SUFFIX", value: "example.com", target: "Proxy", noResolve: false },
      { id: "", type: "IP-CIDR", value: "1.1.1.0/24", target: "DIRECT", noResolve: true },
    ]);
    expect(mocks.interactions.customRuleBatchImported).toHaveBeenCalledWith({
      result: "success",
      ruleCount: 2,
    });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "已导入 2 条规则", variant: "success" }));
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("previews the current rule-set type and dispatches providers instead of domain rules", () => {
    const onImportRuleSets = vi.fn();
    const { html, props } = renderDialog("https://local.subboost.test/geosite/udemy.mrs", {
      defaultType: "RULE-SET", onImportRuleSets,
    });
    expect(html).toContain("RULE-SET");
    mocks.buttons.at(-1).onClick();
    expect(props.onImport).not.toHaveBeenCalled();
    expect(onImportRuleSets).toHaveBeenCalledWith([expect.objectContaining({ id: "udemy", name: "udemy", target: "Proxy" })]);
  });

  it("shows duplicate and invalid rows without importing", () => {
    const { html, props } = renderDialog(
      ["DOMAIN,example.com,Proxy", "BAD,thing,Proxy", "# comment"].join("\n"),
      {
        existingRules: [
          { id: "existing", type: "DOMAIN", value: "example.com", target: "Proxy", noResolve: false },
        ],
      },
    );

    expect(html).toContain("错误 1");
    expect(html).toContain("重复 1");
    expect(html).toContain("跳过 1");
    expect(html).toContain("存在无效或重复规则");
    expect(html).toContain("与现有规则重复");
    expect(html).toContain("未知规则类型：BAD");

    mocks.buttons.at(-1).onClick();

    expect(props.onImport).not.toHaveBeenCalled();
    expect(mocks.interactions.customRuleBatchImported).toHaveBeenCalledWith({
      result: "validationError",
      ruleCount: 0,
    });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "无法导入", variant: "warning" }));
  });
});
