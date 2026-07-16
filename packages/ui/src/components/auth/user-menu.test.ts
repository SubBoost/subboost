import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureAuthConfigHandoff: vi.fn(),
  documentHandlers: {} as Record<string, (event: any) => void>,
  fetchUser: vi.fn(),
  intrinsics: [] as any[],
  links: [] as any[],
  logout: vi.fn(),
  refContains: vi.fn(() => false),
  stateSetter: vi.fn(),
  stateOverride: undefined as boolean | undefined,
  useConfigStore: Object.assign(vi.fn(), { getState: vi.fn(() => ({ sources: [] })) }),
  userState: {
    fetchUser: vi.fn(),
    isLoading: false,
    logout: vi.fn(),
    user: null as any,
  },
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useRef: () => ({ current: { contains: mocks.refContains } }),
    useState: (initial: unknown) => [mocks.stateOverride ?? initial, mocks.stateSetter],
  };
});

vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react/jsx-runtime")>();
  const capture = (type: unknown, props: Record<string, unknown> | null, key?: unknown) => {
    if (typeof type === "string") {
      mocks.intrinsics.push({ type, props: props ?? {}, key });
    }
  };
  return {
    ...actual,
    jsx: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => {
      capture(type, props, key);
      return actual.jsx(type as any, props, key as any);
    },
    jsxs: (type: unknown, props: Record<string, unknown> | null, key?: unknown) => {
      capture(type, props, key);
      return actual.jsxs(type as any, props, key as any);
    },
  };
});

vi.mock("next/link", () => ({
  default: ({ href, onClick, children, ...props }: React.PropsWithChildren<{ href: string; onClick?: () => void }>) => {
    mocks.links.push({ href, onClick });
    return React.createElement("a", { href, ...props }, children);
  },
}));

vi.mock("lucide-react", () => ({
  ChevronDown: () => React.createElement("span", null, "ChevronDown"),
  LayoutDashboard: () => React.createElement("span", null, "LayoutDashboard"),
  LogIn: () => React.createElement("span", null, "LogIn"),
  LogOut: () => React.createElement("span", null, "LogOut"),
  Settings: () => React.createElement("span", null, "Settings"),
  Shield: () => React.createElement("span", null, "Shield"),
  User: () => React.createElement("span", null, "User"),
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => React.createElement("button", props, props.children),
}));

vi.mock("@subboost/ui/components/ui/safe-image", () => ({
  SafeImage: (props: any) => React.createElement("span", null, props.alt, props.fallback),
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

import { UserMenu } from "./user-menu";

function textOf(children: unknown): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (React.isValidElement(children)) return textOf((children.props as { children?: unknown }).children);
  return "";
}

function findIntrinsic(type: string, predicate: (props: any) => boolean) {
  const found = mocks.intrinsics.find((item: any) => item.type === type && predicate(item.props));
  expect(found).toBeTruthy();
  return found.props;
}

describe("UserMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.documentHandlers = {};
    mocks.intrinsics = [];
    mocks.refContains.mockReturnValue(false);
    vi.stubGlobal("document", {
      addEventListener: vi.fn((name: string, handler: (event: any) => void) => {
        mocks.documentHandlers[name] = handler;
      }),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("window", { location: { href: "" } });
    mocks.links = [];
    mocks.stateOverride = undefined;
    mocks.userState = {
      fetchUser: mocks.fetchUser,
      isLoading: false,
      logout: mocks.logout,
      user: null,
    };
  });

  it("renders a loading avatar while user state is loading", () => {
    mocks.userState = { ...mocks.userState, isLoading: true, user: null };

    const html = renderToStaticMarkup(React.createElement(UserMenu));

    expect(html).toContain("animate-pulse");
    expect(mocks.fetchUser).toHaveBeenCalled();
  });

  it("renders login link for anonymous users and captures config handoff", () => {
    const html = renderToStaticMarkup(React.createElement(UserMenu));

    expect(html).toContain("登录");
    expect(mocks.links[0].href).toBe("/login");
    mocks.links[0].onClick();
    expect(mocks.captureAuthConfigHandoff).toHaveBeenCalledWith({ sources: [] });
  });

  it("renders the authenticated user menu and open dropdown items", () => {
    mocks.stateOverride = true;
    mocks.userState = {
      fetchUser: mocks.fetchUser,
      isLoading: false,
      logout: mocks.logout,
      user: {
        avatarUrl: null,
        isAdmin: true,
        isBanned: false,
        name: "Alice",
        username: "alice",
        trustLevel: 4,
        subscriptionCount: 2,
        quota: { maxSubscriptions: 5 },
      },
    };

    const html = renderToStaticMarkup(
      React.createElement(UserMenu, { privilegedMenuItem: { href: "/ops", label: "Privileged" } })
    );

    expect(html).toContain("Alice");
    expect(html).toContain("@alice");
    expect(html).toContain("Lv.4");
    expect(html).toContain("管理员");
    expect(html).toContain("2/5 订阅");
    expect(html).toContain("Privileged");
    expect(html).toContain("我的订阅");
    expect(html).toContain("账户设置");
    expect(html).toContain("退出登录");
    const toggle = findIntrinsic(
      "button",
      (props) => typeof props.className === "string" && props.className.includes("px-2 py-1.5")
    );
    expect(toggle.type).toBe("button");
    expect(toggle["aria-label"]).toBe("用户菜单");
    expect(toggle["aria-haspopup"]).toBe("menu");
    expect(toggle["aria-expanded"]).toBe(true);
  });

  it("closes the menu from document, toggle, overlay, links, and logout actions", async () => {
    mocks.stateOverride = true;
    mocks.userState = {
      fetchUser: mocks.fetchUser,
      isLoading: false,
      logout: mocks.logout,
      user: {
        avatarUrl: null,
        isAdmin: true,
        isBanned: false,
        name: "Alice",
        username: "alice",
        trustLevel: 4,
        subscriptionCount: 2,
        quota: { maxSubscriptions: 5 },
      },
    };

    renderToStaticMarkup(React.createElement(UserMenu, { privilegedMenuItem: { href: "/ops", label: "Privileged" } }));

    mocks.documentHandlers.mousedown({ target: {} });
    expect(mocks.stateSetter).toHaveBeenCalledWith(false);

    mocks.stateSetter.mockClear();
    mocks.refContains.mockReturnValueOnce(true);
    mocks.documentHandlers.mousedown({ target: {} });
    expect(mocks.stateSetter).not.toHaveBeenCalled();

    findIntrinsic("button", (props) => typeof props.className === "string" && props.className.includes("px-2 py-1.5")).onClick();
    expect(mocks.stateSetter).toHaveBeenCalledWith(false);

    findIntrinsic("div", (props) => typeof props.className === "string" && props.className.includes("fixed inset-0")).onClick();
    expect(mocks.stateSetter).toHaveBeenCalledWith(false);

    for (const link of mocks.links) {
      link.onClick?.();
    }
    expect(mocks.stateSetter).toHaveBeenCalledWith(false);

    await findIntrinsic("button", (props) => textOf(props.children).includes("退出登录")).onClick();
    expect(mocks.logout).toHaveBeenCalled();
    expect(mocks.stateSetter).toHaveBeenCalledWith(false);
    expect(window.location.href).toBe("/");
  });
});
