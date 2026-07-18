import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captures: {} as Record<string, any[]>,
}));

vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react/jsx-runtime")>();
  const capture = (type: unknown, props: any) => {
    if (type === "button" && typeof props?.onClick === "function") {
      (mocks.captures.nativeButtons ||= []).push(props);
    }
  };
  return {
    ...actual,
    jsx: (type: unknown, props: any, key?: string) => {
      capture(type, props);
      return actual.jsx(type as any, props, key);
    },
    jsxs: (type: unknown, props: any, key?: string) => {
      capture(type, props);
      return actual.jsxs(type as any, props, key);
    },
  };
});

vi.mock("lucide-react", () => ({
  CheckCircle: () => React.createElement("span", null, "check-icon"),
  Clock: () => React.createElement("span", null, "clock-icon"),
  Download: () => React.createElement("span", null, "download-icon"),
  Globe: () => React.createElement("span", null, "globe-icon"),
  Heart: () => React.createElement("span", null, "heart-icon"),
  Layers: () => React.createElement("span", null, "layers-icon"),
  ListChecks: () => React.createElement("span", null, "list-icon"),
  Loader2: () => React.createElement("span", null, "loader-icon"),
  Lock: () => React.createElement("span", null, "lock-icon"),
  Trash2: () => React.createElement("span", null, "trash-icon"),
}));
vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.captures.buttons.push(props);
    return React.createElement("button", props, props.children);
  },
}));
vi.mock("@subboost/ui/components/ui/card", () => ({
  Card: (props: any) => React.createElement("section", props, props.children),
  CardContent: (props: any) => React.createElement("div", props, props.children),
}));
vi.mock("@subboost/ui/lib/utils", () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" "),
}));

import { TemplateCard } from "./template-card";
import type { Template } from "./types";

const baseTemplate: Template = {
  id: "tpl-1",
  name: "Balanced",
  description: "A balanced template.",
  downloads: 1200,
  engagementCount: 8,
  createdAt: "2026-01-02T00:00:00.000Z",
  tags: [],
  proxyGroupCount: 2,
  ruleCount: 3,
};

function renderCard(overrides: Partial<React.ComponentProps<typeof TemplateCard>> = {}) {
  mocks.captures = { buttons: [], nativeButtons: [] };
  const props: React.ComponentProps<typeof TemplateCard> = {
    template: baseTemplate,
    formatNumber: (value) => `n:${value}`,
    formatDate: (value) => `date:${value}`,
    onEngage: vi.fn(),
    onApply: vi.fn(),
    onDelete: vi.fn(),
    isLoggedIn: true,
    isApplying: false,
    showDelete: true,
    showVisibility: true,
    showEngagement: true,
    ...overrides,
  };
  const html = renderToStaticMarkup(React.createElement(TemplateCard, props));
  return { html, props };
}

describe("TemplateCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captures = { buttons: [], nativeButtons: [] };
  });

  it("renders public engaged templates and wires delete, apply, and engagement actions", () => {
    const { html, props } = renderCard({
      template: { ...baseTemplate, isEngaged: true, isPublic: true },
      engagementActionLabel: "取消收藏",
      engagementLoginRequiredLabel: "请先登录",
    });

    expect(html).toContain("Balanced");
    expect(html).toContain("2 代理组");
    expect(html).toContain("3 规则集");
    expect(html).toContain("n:1200");
    expect(html).toContain("date:2026-01-02T00:00:00.000Z");
    expect(html).toContain("公开");
    expect(html).toContain("使用");

    mocks.captures.buttons.find((button) => button.title === "删除模板").onClick();
    expect(props.onDelete).toHaveBeenCalled();
    mocks.captures.buttons.find((button) => button.children?.includes?.("使用")).onClick();
    expect(props.onApply).toHaveBeenCalled();

    const engageButton = mocks.captures.buttons.find((button) => button.title === "取消收藏");
    expect(engageButton.disabled).toBe(false);
    expect(engageButton.className).toContain("text-red-400");
    engageButton.onClick();
    expect(props.onEngage).toHaveBeenCalled();
  });

  it("renders applying, private, and logged-out fallback states", () => {
    const { html } = renderCard({
      template: {
        ...baseTemplate,
        isEngaged: false,
        isPublic: false,
        proxyGroupCount: undefined,
        ruleCount: null,
      },
      onDelete: undefined,
      isLoggedIn: false,
      isApplying: true,
      showDelete: true,
    });

    expect(html).toContain("— 代理组");
    expect(html).toContain("— 规则集");
    expect(html).toContain("私有");
    expect(html).toContain("应用中");
    expect(html).toContain("loader-icon");
    expect(mocks.captures.buttons.some((button) => button.title === "删除模板")).toBe(false);
    expect(mocks.captures.buttons.find((button) => button.children?.includes?.("应用中")).disabled).toBe(true);

    const engageButton = mocks.captures.buttons.find((button) => button.title === "登录后可收藏");
    expect(engageButton.disabled).toBe(true);
    expect(engageButton.className).toContain("cursor-not-allowed");
  });

  it("hides optional controls when the parent disables them", () => {
    const { html } = renderCard({
      showDelete: false,
      showEngagement: false,
      showVisibility: false,
    });

    expect(html).not.toContain("公开");
    expect(html).not.toContain("私有");
    expect(mocks.captures.buttons.some((button) => button.title === "删除模板")).toBe(false);
    expect(mocks.captures.buttons.some((button) => button.title === "登录后可收藏")).toBe(false);
  });
});
