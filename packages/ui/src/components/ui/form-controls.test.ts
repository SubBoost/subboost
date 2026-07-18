import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { ChoiceChip, ChoiceGroup } from "./choice-group";
import { FormField } from "./form-field";
import { IconButton, type IconButtonProps } from "./icon-button";
import { Input } from "./input";
import { PasswordField } from "./password-field";
import { SwitchField } from "./switch-field";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

describe("composed form controls", () => {
  it("associates labels, descriptions, errors, required state, and existing IDs", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        FormField,
        {
          id: "account-name",
          label: "账号",
          description: "用于登录",
          error: "不能为空",
          required: true,
        },
        React.createElement(Input, { "aria-describedby": "external-help" })
      )
    );

    expect(html).toContain('for="account-name"');
    expect(html).toContain('id="account-name"');
    expect(html).toContain('aria-describedby="external-help account-name-description account-name-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('role="alert"');
  });

  it("renders a disabled, labelled switch with its description", () => {
    const html = renderToStaticMarkup(
      React.createElement(SwitchField, {
        label: "监听端口",
        description: "允许局域网访问",
        checked: true,
        disabled: true,
        density: "compact",
        onCheckedChange: vi.fn(),
      })
    );

    expect(html).toContain("监听端口");
    expect(html).toContain("允许局域网访问");
    expect(html).toContain('aria-labelledby="switch-field-');
    expect(html).toContain('aria-describedby="switch-field-');
    expect(html).toContain('disabled=""');
  });

  it("requires a label and gives icon links one accessible focus target", () => {
    expectTypeOf<IconButtonProps>().toHaveProperty("label");

    const html = renderToStaticMarkup(
      React.createElement(
        IconButton,
        { label: "返回首页", asChild: true, variant: "ghost" },
        React.createElement("a", { href: "/" }, React.createElement("svg"))
      )
    );

    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).not.toContain("<button");
    expect(html).toContain('aria-label="返回首页"');
    expect(html).toContain('title="返回首页"');
  });

  it("renders password reveal state with an associated field label", () => {
    const html = renderToStaticMarkup(
      React.createElement(PasswordField, {
        id: "password",
        label: "密码",
        description: "至少八位",
        autoComplete: "current-password",
        value: "secret123",
        readOnly: true,
      })
    );

    expect(html).toContain('for="password"');
    expect(html).toContain('type="password"');
    expect(html).toContain('aria-label="显示密码"');
    expect(html).toContain('aria-describedby="password-description"');
  });

  it("exposes selected choice state and group naming", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ChoiceGroup,
        { label: "源类型" },
        React.createElement(ChoiceChip, { label: "订阅链接", selected: true }),
        React.createElement(ChoiceChip, { label: "文件", selected: false, disabled: true })
      )
    );

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="源类型"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });

  it("renders the thin table elements inside a horizontal scroll container", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        TableContainer,
        null,
        React.createElement(
          Table,
          null,
          React.createElement(TableCaption, null, "用户列表"),
          React.createElement(TableHeader, null, React.createElement(TableRow, null, React.createElement(TableHead, null, "用户"))),
          React.createElement(TableBody, null, React.createElement(TableRow, null, React.createElement(TableCell, null, "Ry")))
        )
      )
    );

    expect(html).toContain("overflow-x-auto");
    expect(html).toContain("<table");
    expect(html).toContain("<thead");
    expect(html).toContain("<tbody");
    expect(html).toContain("<caption");
  });
});
