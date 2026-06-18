import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  links: [] as any[],
  userMenuProps: [] as any[],
  pathname: "/",
  userState: { user: null as null | { isAdmin?: boolean; isBanned?: boolean } },
  configState: { draft: "state" },
  captureAuthConfigHandoff: vi.fn(),
}));

const stateMock = vi.hoisted(() => ({
  enabled: false,
  mobileOpen: false,
  setter: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!stateMock.enabled) return actual.useState(initial);
      stateMock.setter = vi.fn();
      return [stateMock.mobileOpen ?? initial, stateMock.setter];
    },
  };
});

vi.mock("next/link", async () => {
  const ReactModule = await import("react");
  return {
    default: (props: any) => {
      mocks.links.push(props);
      return ReactModule.createElement("a", { href: props.href, className: props.className }, props.children);
    },
  };
});

vi.mock("next/image", async () => {
  const ReactModule = await import("react");
  return {
    default: (props: any) => ReactModule.createElement("img", { alt: props.alt, src: props.src }),
  };
});

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("lucide-react", () => ({
  Home: () => React.createElement("span", null, "home-icon"),
  LayoutDashboard: () => React.createElement("span", null, "dashboard-icon"),
  Library: () => React.createElement("span", null, "library-icon"),
  HelpCircle: () => React.createElement("span", null, "help-icon"),
  Menu: () => React.createElement("span", null, "menu-icon"),
  X: () => React.createElement("span", null, "x-icon"),
  LogIn: () => React.createElement("span", null, "login-icon"),
  Shield: () => React.createElement("span", null, "shield-icon"),
}));

vi.mock("@subboost/ui/components/auth/user-menu", async () => {
  const ReactModule = await import("react");
  return {
    UserMenu: (props: any) => {
      mocks.userMenuProps.push(props);
      return ReactModule.createElement("div", null, "user-menu");
    },
  };
});

vi.mock("@subboost/ui/store/config-store/auth-handoff", () => ({
  captureAuthConfigHandoff: mocks.captureAuthConfigHandoff,
}));

vi.mock("@subboost/ui/store/config-store", () => ({
  useConfigStore: {
    getState: () => mocks.configState,
  },
}));

vi.mock("@subboost/ui/store/user-store", () => ({
  useUserStore: () => mocks.userState,
}));

import { Header } from "./header";

const adminPath = "/" + "admin";
const adminSettingsPath = `${adminPath}/settings`;

function renderHeader(options: React.ComponentProps<typeof Header> = {}, mobileOpen = false) {
  mocks.links = [];
  mocks.userMenuProps = [];
  stateMock.enabled = true;
  stateMock.mobileOpen = mobileOpen;
  try {
    return renderToStaticMarkup(React.createElement(Header, options));
  } finally {
    stateMock.enabled = false;
  }
}

describe("Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pathname = "/";
    mocks.userState = { user: null };
    mocks.configState = { draft: "state" };
  });

  it("renders guest default navigation without authenticated links", () => {
    const html = renderHeader();

    expect(html).toContain("SubBoost");
    expect(html).toContain("online");
    expect(html).toContain("在线入口");
    expect(html).toContain("首页");
    expect(html).toContain("FAQ");
    expect(html).not.toContain("我的订阅");
    expect(html).toContain("menu-icon");
    expect(mocks.userMenuProps[0]).toEqual({ privilegedMenuItem: undefined });
  });

  it("renders local navigation without default-only privileged links", () => {
    mocks.userState = { user: { isAdmin: true, isBanned: false } };
    mocks.pathname = "/dashboard";

    const html = renderHeader({ mode: "local", privilegedMenuItem: { href: adminPath, label: "管理" } as any }, true);

    expect(html).toContain("self-host");
    expect(html).toContain("自部署入口");
    expect(html).toContain("我的订阅");
    expect(html).not.toContain("FAQ");
    expect(html).not.toContain("管理");
    expect(mocks.links.some((link) => link.href === adminPath)).toBe(false);
  });

  it("renders a linked new release badge outside the home link", () => {
    const releaseUrl = "https://github.com/SubBoost/subboost/releases/tag/v9.8.7";
    const html = renderHeader({
      mode: "local",
      extraBrandBadge: {
        label: "new",
        href: releaseUrl,
        external: true,
        title: "SubBoost v9.8.7 已发布",
      },
    });

    expect(html).toContain("new");
    expect(html).toContain("self-host");
    expect(html).toContain(`href="${releaseUrl}"`);
    expect(html).toContain('target="_blank"');

    const releaseLinkIndex = html.indexOf(`href="${releaseUrl}"`);
    const homeLinkIndex = html.lastIndexOf('href="/"', releaseLinkIndex);
    const homeLinkCloseIndex = html.lastIndexOf("</a>", releaseLinkIndex);
    expect(homeLinkCloseIndex).toBeGreaterThan(homeLinkIndex);
  });

  it("renders internal brand badge links without external target attributes", () => {
    const html = renderHeader({
      extraBrandBadge: {
        label: "preview",
        href: "/preview",
      },
    });

    expect(html).toContain("preview");
    expect(html).toContain('href="/preview"');
    expect(html).not.toContain('target="_blank"');
  });

  it("renders and closes mobile privileged navigation for admins", () => {
    mocks.userState = { user: { isAdmin: true, isBanned: false } };
    mocks.pathname = adminSettingsPath;

    const html = renderHeader({ privilegedMenuItem: { href: adminPath, label: "管理" } as any }, true);

    expect(html).toContain("x-icon");
    expect(html).toContain("管理");
    const mobileDashboard = mocks.links.find((link) => link.href === "/dashboard" && typeof link.onClick === "function");
    const mobileAdmin = mocks.links.find((link) => link.href === adminPath && typeof link.onClick === "function");

    mobileDashboard.onClick();
    mobileAdmin.onClick();

    expect(stateMock.setter).toHaveBeenCalledWith(false);
  });

  it("captures guest draft state before mobile login navigation", () => {
    const html = renderHeader({}, true);

    expect(html).toContain("登录");
    const loginLink = mocks.links.find((link) => link.href === "/login");
    loginLink.onClick();

    expect(mocks.captureAuthConfigHandoff).toHaveBeenCalledWith({ draft: "state" });
    expect(stateMock.setter).toHaveBeenCalledWith(false);
  });
});
