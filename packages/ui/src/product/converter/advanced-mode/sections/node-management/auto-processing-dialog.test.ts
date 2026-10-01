import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedNode } from "@subboost/core/types/node";

const mocks = vi.hoisted(() => ({
  buttons: [] as Array<Record<string, any>>,
  dialog: null as Record<string, any> | null,
  formField: null as Record<string, any> | null,
  switchField: null as Record<string, any> | null,
  textarea: null as Record<string, any> | null,
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.buttons.push(props);
    return React.createElement("button", { disabled: props.disabled }, props.children);
  },
}));
vi.mock("@subboost/ui/components/ui/dialog", () => ({
  Dialog: (props: any) => {
    mocks.dialog = props;
    return props.children;
  },
  DialogContent: (props: any) => React.createElement("section", null, props.children),
  DialogDescription: (props: any) => React.createElement("p", null, props.children),
  DialogFooter: (props: any) => React.createElement("footer", null, props.children),
  DialogHeader: (props: any) => React.createElement("header", null, props.children),
  DialogTitle: (props: any) => React.createElement("h2", null, props.children),
}));
vi.mock("@subboost/ui/components/ui/form-field", () => ({
  FormField: (props: any) => {
    mocks.formField = props;
    const label = React.createElement("label", null, props.label);
    const description = props.description
      ? React.createElement("p", null, props.description)
      : null;
    return React.createElement(
      "div",
      null,
      props.descriptionPlacement === "before-control"
        ? React.createElement("div", null, label, description)
        : label,
      props.children,
      props.descriptionPlacement === "before-control" ? null : description,
      props.error ? React.createElement("p", { role: "alert" }, props.error) : null
    );
  },
}));
vi.mock("@subboost/ui/components/ui/switch-field", () => ({
  SwitchField: (props: any) => {
    mocks.switchField = props;
    return React.createElement(
      "label",
      null,
      props.label,
      React.createElement("input", {
        checked: props.checked,
        readOnly: true,
        type: "checkbox",
      })
    );
  },
}));
vi.mock("@subboost/ui/components/ui/textarea", () => ({
  Textarea: (props: any) => {
    mocks.textarea = props;
    return React.createElement("textarea", {
      placeholder: props.placeholder,
      readOnly: true,
      value: props.value,
    });
  },
}));

import { NodeManagementAutoProcessingDialog } from "./auto-processing-dialog";

const nodes = [
  {
    name: "[HK] Alpha",
    type: "ss",
    server: "alpha.test",
    port: 443,
    cipher: "aes-128-gcm",
    password: "secret",
    _originName: "Alpha",
  },
  {
    name: "Beta",
    type: "vless",
    server: "beta.test",
    port: 8443,
    uuid: "00000000-0000-4000-8000-000000000001",
  },
] as ParsedNode[];

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof NodeManagementAutoProcessingDialog>> = {}
) {
  const props: React.ComponentProps<typeof NodeManagementAutoProcessingDialog> = {
    open: true,
    onOpenChange: vi.fn(),
    nodes,
    config: { enabled: true, excludeRegexes: ["alpha"] },
    hasProxyProviders: false,
    onSave: vi.fn(),
    ...overrides,
  };
  const html = renderToStaticMarkup(
    React.createElement(NodeManagementAutoProcessingDialog, props)
  );
  return { html, props };
}

function findButton(label: string) {
  return mocks.buttons.find((button) => button.children === label);
}

describe("NodeManagementAutoProcessingDialog", () => {
  beforeEach(() => {
    mocks.buttons = [];
    mocks.dialog = null;
    mocks.formField = null;
    mocks.switchField = null;
    mocks.textarea = null;
  });

  it("renders the compact wording, counts, and matching display/origin names", () => {
    const { html } = renderDialog();
    const helperText =
      "每行一条，命中节点会被全局排除。";

    expect(html).toContain("自动处理");
    expect(html).toContain("启用");
    expect(html).toContain("排除正则");
    expect(html).toContain(helperText);
    expect(html).toContain("剩余流量|套餐到期|注意事项");
    expect(html.indexOf("排除正则")).toBeLessThan(html.indexOf(helperText));
    expect(html.indexOf(helperText)).toBeLessThan(
      html.indexOf("剩余流量|套餐到期|注意事项")
    );
    expect(html).toContain("导入 2 · 排除 1 · 保留 1");
    expect(html).toContain("[HK] Alpha");
    expect(html).toContain("原名：Alpha");
    expect(html).not.toContain("原名：Beta");
    expect(mocks.formField).toEqual(
      expect.objectContaining({
        description: helperText,
        descriptionPlacement: "before-control",
        label: "排除正则",
      })
    );
    expect(mocks.switchField).toEqual(
      expect.objectContaining({ checked: true, label: "启用" })
    );
  });

  it("normalizes empty and duplicate lines before saving", () => {
    const { props } = renderDialog({
      config: {
        enabled: true,
        excludeRegexes: [" Alpha ", "", "Alpha"],
      },
    });

    const saveButton = findButton("保存");
    expect(saveButton).toEqual(expect.objectContaining({ disabled: false }));
    saveButton?.onClick();

    expect(props.onSave).toHaveBeenCalledWith({
      enabled: true,
      includeEnabled: true,
      excludeEnabled: true,
      excludeRegexes: ["Alpha"],
    });
    expect(props.onOpenChange).toHaveBeenCalledWith(false);
  });

  it("saves a keep-only filter and describes excluded nodes", () => {
    const { html, props } = renderDialog({ config: { enabled: true, includeRegexes: [" Alpha ", "Alpha"], excludeRegexes: [] } });
    expect(html).toContain("导入 2 · 排除 1 · 保留 1");
    expect(html).toContain("排除的节点");
    findButton("保存")?.onClick();
    expect(props.onSave).toHaveBeenCalledWith({ enabled: true, includeEnabled: true, excludeEnabled: true, includeRegexes: ["Alpha"], excludeRegexes: [] });
  });

  it("saves independent switch states while preserving both regex lists", () => {
    const { props, html } = renderDialog({ config: { enabled: true, includeEnabled: false, excludeEnabled: false,
      includeRegexes: ["Alpha"], excludeRegexes: ["Beta"] } });
    expect(html).toContain("导入 2 · 排除 0 · 保留 2");
    expect(mocks.formField?.labelAction).toBeDefined();
    findButton("保存")?.onClick();
    expect(props.onSave).toHaveBeenCalledWith({ enabled: true, includeEnabled: false, excludeEnabled: false,
      includeRegexes: ["Alpha"], excludeRegexes: ["Beta"] });
  });

  it.each(["[", "x".repeat(201), Array.from({length: 21}, (_, i) => `node-${i}`).join("\n")])("identifies invalid keep conditions", (pattern) => {
    const { html, props } = renderDialog({ config: { enabled: true, includeRegexes: [pattern], excludeRegexes: [] } });
    expect(html).toContain("保留正则：");
    expect(findButton("保存")?.disabled).toBe(true);
    findButton("保存")?.onClick();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it.each([
    { pattern: "[", message: "第 2 行正则无效" },
    { pattern: "(a+)+$", message: "第 2 行正则过于复杂" },
  ])("blocks invalid rules and reports their source line", ({ pattern, message }) => {
    const { html, props } = renderDialog({
      config: { enabled: true, excludeRegexes: ["nomatch", pattern] },
    });

    expect(html).toContain(message);
    const saveButton = findButton("保存");
    expect(saveButton).toEqual(expect.objectContaining({ disabled: true }));
    saveButton?.onClick();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("blocks an empty effective result unless proxy-providers keep output valid", () => {
    let result = renderDialog({
      config: { enabled: true, excludeRegexes: [".*"] },
    });

    expect(result.html).toContain("过滤后没有可用节点，请调整规则或关闭过滤。");
    expect(findButton("保存")).toEqual(expect.objectContaining({ disabled: true }));

    mocks.buttons = [];
    result = renderDialog({
      config: { enabled: true, excludeRegexes: [".*"] },
      hasProxyProviders: true,
    });
    expect(result.html).toContain("proxy-providers 不参与。");
    const providerSaveButton = findButton("保存");
    expect(providerSaveButton).toEqual(expect.objectContaining({ disabled: false }));
    providerSaveButton?.onClick();
    expect(result.props.onSave).toHaveBeenCalledWith({
      enabled: true,
      includeEnabled: true,
      excludeEnabled: true,
      excludeRegexes: [".*"],
    });
  });

  it("closes through both the dialog contract and the cancel button", () => {
    const { props } = renderDialog();

    mocks.dialog?.onOpenChange(false);
    findButton("取消")?.onClick();

    expect(props.onOpenChange).toHaveBeenCalledTimes(2);
    expect(props.onOpenChange).toHaveBeenNthCalledWith(1, false);
    expect(props.onOpenChange).toHaveBeenNthCalledWith(2, false);
  });
});
