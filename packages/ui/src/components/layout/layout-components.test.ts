import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureAuthConfigHandoff: vi.fn(),
  pathname: "/",
  userState: { user: null as any },
  useConfigStore: Object.assign(vi.fn(), { getState: vi.fn(() => ({ sources: [] })) }),
  userMenu: vi.fn((props: any) => React.createElement("div", null, `UserMenu:${props.privilegedMenuItem?.label ?? "none"}`)),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.PropsWithChildren<{ href: string }>) =>
    React.createElement("a", { href, ...props }, children),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string }) =>
    React.createElement("img", { src, alt, ...props }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("lucide-react", () => ({
  Bot: () => React.createElement("span", null, "Bot"),
  Eye: () => React.createElement("span", null, "Eye"),
  ExternalLink: () => React.createElement("span", null, "ExternalLink"),
  HelpCircle: () => React.createElement("span", null, "HelpCircle"),
  Home: () => React.createElement("span", null, "Home"),
  LayoutDashboard: () => React.createElement("span", null, "LayoutDashboard"),
  Library: () => React.createElement("span", null, "Library"),
  LogIn: () => React.createElement("span", null, "LogIn"),
  Menu: () => React.createElement("span", null, "Menu"),
  Settings2: () => React.createElement("span", null, "Settings2"),
  Shield: () => React.createElement("span", null, "Shield"),
  User: () => React.createElement("span", null, "User"),
  X: () => React.createElement("span", null, "X"),
}));

vi.mock("react-remove-scroll-bar", () => ({
  zeroRightClassName: "zero-right",
}));

vi.mock("@subboost/ui/components/auth/user-menu", () => ({
  UserMenu: mocks.userMenu,
}));

vi.mock("@subboost/ui/store/config-store/auth-handoff", () => ({
  captureAuthConfigHandoff: mocks.captureAuthConfigHandoff,
}));

vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: mocks.useConfigStore,
}));

vi.mock("@subboost/ui/store/user-store", () => ({
  useUserStore: () => mocks.userState,
}));

import { Footer } from "./footer";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";

describe("shared layout components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/";
    mocks.userState = { user: null };
  });

  it("renders the default header for anonymous users without auth-only links", () => {
    const html = renderToStaticMarkup(React.createElement(Header));

    expect(html).toContain("SubBoost");
    expect(html).toContain("首页");
    expect(html).toContain("FAQ");
    expect(html).not.toContain("我的订阅");
    expect(html).toContain("UserMenu:none");
  });

  it("renders local mode header links and privileged menu item", () => {
    mocks.pathname = "/ops";
    mocks.userState = { user: { isAdmin: true, isBanned: false } };

    const html = renderToStaticMarkup(
      React.createElement(Header, {
        mode: "local",
        privilegedMenuItem: { href: "/ops", label: "Privileged" },
      })
    );

    expect(html).toContain("self-host");
    expect(html).toContain("自部署入口");
    expect(html).toContain("我的订阅");
    expect(html).not.toContain("FAQ");
    expect(html).toContain("UserMenu:Privileged");
  });

  it("renders footer links according to mode and auth state", () => {
    let html = renderToStaticMarkup(React.createElement(Footer, { mode: "local", buildVersion: "2.3.17" }));
    expect(html).toContain("开源仓库");
    expect(html).toContain("https://github.com/SubBoost/subboost");
    expect(html).toContain("配置教程");
    expect(html).toContain("https://subboost.org/faq");
    expect(html).not.toContain("本地管理员入口");
    expect(html).not.toContain("我的订阅");
    expect(html).toContain("Powered by SubBoost | v 2.3.17");

    mocks.userState = { user: { id: "user-1" } };
    html = renderToStaticMarkup(
      React.createElement(Footer, {
        brandLinks: [{ href: "https://example.test", label: "Example", iconSrc: "/example.png" }],
        helpLinks: [{ href: "/help", label: "Help" }],
        resourceLinks: [{ href: "/disabled", label: "Disabled", disabled: true }],
      })
    );
    expect(html).toContain("我的订阅");
    expect(html).toContain("Help");
    expect(html).toContain("Disabled");
    expect(html).toContain("/example.png");

    mocks.userState = { user: { id: "admin-1", isAdmin: true, isBanned: false } };
    html = renderToStaticMarkup(React.createElement(Footer, { buildVersion: "2.3.17" }));
    expect(html).toContain("开源仓库");
    expect(html).toContain("https://github.com/SubBoost/subboost");
    expect(html).toContain('data-brand-icon="github"');
    expect(html).toContain("RyanVan&#x27;s Blog");
    expect(html).toContain("https://linux.do");
    expect(html).toContain("https://subboost.org/terms");
    expect(html).toContain("Mihomo Core");
    expect(html).not.toContain("源代码");
    expect(html).toContain("Powered by SubBoost | v 2.3.17");
  });

  it("renders mobile nav items for anonymous and authenticated users", () => {
    mocks.pathname = "/";
    let html = renderToStaticMarkup(React.createElement(MobileNav));
    expect(html).toContain("配置");
    expect(html).toContain("预览");
    expect(html).not.toContain("AI");
    expect(html).toContain("zero-right");

    mocks.userState = { user: { id: "user-1" } };
    html = renderToStaticMarkup(React.createElement(MobileNav, { mode: "local" }));
    expect(html).toContain("首页");
    expect(html).toContain("订阅");
  });
});
