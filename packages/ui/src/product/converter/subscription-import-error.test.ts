import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionImportErrorInfo } from "@subboost/core/subscription/import-error";

const mocks = vi.hoisted(() => ({
  buttons: [] as any[],
  toast: vi.fn(),
  formatInBeijing: vi.fn(() => "02/19 12:00"),
}));

function collectButtons(node: unknown) {
  if (Array.isArray(node)) {
    for (const child of node) collectButtons(child);
    return;
  }
  if (!node || typeof node !== "object") return;
  const element = node as { type?: unknown; props?: { children?: unknown } };
  if (element.type === "button") mocks.buttons.push(element.props);
  collectButtons(element.props?.children);
}

vi.mock("lucide-react", () => ({
  AlertCircle: () => React.createElement("span", null, "alert"),
  Clock: () => React.createElement("span", null, "clock"),
  Copy: () => React.createElement("span", null, "copy"),
  ChevronRight: () => React.createElement("span", null, "chevron"),
  Menu: () => React.createElement("span", null, "menu"),
}));

vi.mock("@subboost/ui/components/ui/dialog", async () => {
  const ReactModule = await import("react");
  return {
    Dialog: (props: any) => ReactModule.createElement("div", null, props.children),
    DialogContent: (props: any) => {
      collectButtons(props.children);
      return ReactModule.createElement("section", null, props.children);
    },
    DialogHeader: (props: any) => ReactModule.createElement("header", null, props.children),
    DialogTitle: (props: any) => ReactModule.createElement("h2", null, props.children),
    DialogTrigger: (props: any) => ReactModule.createElement("span", null, props.children),
  };
});

vi.mock("@subboost/ui/lib/utils", () => ({
  cn: (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" "),
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    if (typeof props.onClick === "function") mocks.buttons.push(props);
    return React.createElement("button", props, props.children);
  },
}));

vi.mock("@subboost/ui/components/ui/toaster", () => ({
  toast: mocks.toast,
}));

vi.mock("@subboost/core/time/beijing", () => ({
  formatInBeijing: mocks.formatInBeijing,
}));

import { SubscriptionImportErrorBadge } from "./subscription-import-error";

const errorInfo: SubscriptionImportErrorInfo = {
  category: "network",
  message: "HTTP 500 token=secret",
  detail: "连接失败 password=hidden",
  httpStatus: 500,
  suggestedActions: ["检查链接", "稍后重试"],
  at: Date.UTC(2026, 1, 19, 12, 0, 0),
};

describe("SubscriptionImportErrorBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.buttons = [];
  });

  it("renders nothing when no import error can be normalized", () => {
    expect(renderToStaticMarkup(React.createElement(SubscriptionImportErrorBadge))).toBe("");
  });

  it("renders sanitized error details, technical detail, and suggestions", () => {
    const html = renderToStaticMarkup(
      React.createElement(SubscriptionImportErrorBadge, {
        errorInfo,
        className: "extra",
        maxChars: 4,
      })
    );

    expect(html).toContain("查看错误详情");
    expect(html).toContain("导入错误");
    expect(html).toContain("HTTP 500 token=***");
    expect(html).toContain("连接失败 password=***");
    expect(html).toContain("检查链接");
    expect(html).toContain("稍后重试");
    expect(html).toContain("extra");
    expect(mocks.formatInBeijing).toHaveBeenCalled();
    expect(mocks.buttons.length).toBe(2);
  });

  it("uses user-facing labels and hides duplicate technical details", () => {
    const html = renderToStaticMarkup(
      React.createElement(SubscriptionImportErrorBadge, {
        errorInfo: {
          ...errorInfo,
          isUserFacingReason: true,
          detail: "HTTP 500 token=secret",
          suggestedActions: [],
        },
      })
    );

    expect(html).toContain("提示信息");
    expect(html).toContain("提示内容");
    expect(html).not.toContain("技术细节");
  });

  it("copies public and technical details with success toasts", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    renderToStaticMarkup(React.createElement(SubscriptionImportErrorBadge, { errorInfo }));

    await mocks.buttons[0].onClick();
    await mocks.buttons[1].onClick();

    expect(writeText).toHaveBeenNthCalledWith(1, "HTTP 500 token=***");
    expect(writeText).toHaveBeenNthCalledWith(2, "连接失败 password=***");
    expect(mocks.toast).toHaveBeenNthCalledWith(1, { title: "已复制" });
    expect(mocks.toast).toHaveBeenNthCalledWith(2, { title: "已复制技术细节" });
  });

  it("shows a destructive toast when clipboard writes fail", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
    });
    renderToStaticMarkup(React.createElement(SubscriptionImportErrorBadge, { errorMessage: "ETIMEDOUT token=secret" }));

    await mocks.buttons[0].onClick();

    expect(mocks.toast).toHaveBeenCalledWith({ title: "复制失败", variant: "destructive" });
  });
});
