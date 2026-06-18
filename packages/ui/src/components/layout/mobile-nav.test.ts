import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  links: [] as any[],
  pathname: "/",
  userState: { user: null as null | { id?: string } },
}));

const stateMock = vi.hoisted(() => ({
  enabled: false,
  runEffects: false,
  activeHash: "",
  setter: vi.fn(),
  cleanup: undefined as undefined | (() => void),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: React.EffectCallback, deps?: React.DependencyList) => {
      if (!stateMock.enabled || !stateMock.runEffects) return actual.useEffect(effect, deps);
      const cleanup = effect();
      if (typeof cleanup === "function") stateMock.cleanup = cleanup;
    },
    useState: (initial: unknown) => {
      if (!stateMock.enabled) return actual.useState(initial);
      stateMock.setter = vi.fn();
      return [stateMock.activeHash || initial, stateMock.setter];
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

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock("lucide-react", () => ({
  Bot: () => React.createElement("span", null, "bot"),
  Eye: () => React.createElement("span", null, "eye"),
  Home: () => React.createElement("span", null, "home"),
  Library: () => React.createElement("span", null, "library"),
  Settings2: () => React.createElement("span", null, "settings"),
  User: () => React.createElement("span", null, "user"),
}));

vi.mock("react-remove-scroll-bar", () => ({
  zeroRightClassName: "zero-right",
}));

vi.mock("@subboost/ui/store/user-store", () => ({
  useUserStore: () => mocks.userState,
}));

import { MobileNav } from "./mobile-nav";

function renderMobileNav(options: React.ComponentProps<typeof MobileNav> = {}, state: { activeHash?: string; runEffects?: boolean } = {}) {
  mocks.links = [];
  stateMock.enabled = true;
  stateMock.runEffects = Boolean(state.runEffects);
  stateMock.activeHash = state.activeHash || "";
  stateMock.cleanup = undefined;
  try {
    const html = renderToStaticMarkup(React.createElement(MobileNav, options));
    const cleanup = stateMock.cleanup as undefined | (() => void);
    return { html, links: mocks.links, setter: stateMock.setter, cleanup };
  } finally {
    stateMock.enabled = false;
    stateMock.runEffects = false;
  }
}

describe("MobileNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.pathname = "/";
    mocks.userState = { user: null };
  });

  it("renders guest default navigation and handles home hash clicks", () => {
    const scrollIntoView = vi.fn();
    const preventDefault = vi.fn();
    vi.stubGlobal("document", {
      getElementById: vi.fn(() => ({ scrollIntoView })),
    });
    vi.stubGlobal("window", {
      history: { replaceState: vi.fn() },
    });

    const { html, links, setter } = renderMobileNav({}, { activeHash: "config" });

    expect(html).toContain("配置");
    expect(html).toContain("预览");
    expect(html).not.toContain("AI");
    expect(html).not.toContain("我的");
    expect(html).toContain("text-indigo-400");

    links.find((link) => link.href === "/#config").onClick({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(window.history.replaceState).toHaveBeenCalledWith(null, "", "/#config");
    expect(setter).toHaveBeenCalledWith("config");
  });

  it("renders authenticated default navigation without intercepting hash clicks away from home", () => {
    const preventDefault = vi.fn();
    mocks.pathname = "/dashboard";
    mocks.userState = { user: { id: "u1" } };

    const { html, links } = renderMobileNav();

    expect(html).toContain("AI");
    expect(html).toContain("我的");
    expect(html).toContain("text-indigo-400");
    links.find((link) => link.href === "/#ai").onClick({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("renders local navigation for guests and authenticated users", () => {
    let result = renderMobileNav({ mode: "local" });
    expect(result.html).toContain("首页");
    expect(result.html).not.toContain("订阅");

    mocks.pathname = "/dashboard/settings";
    mocks.userState = { user: { id: "u1" } };
    result = renderMobileNav({ mode: "local" });
    expect(result.html).toContain("订阅");
    expect(result.links.some((link) => link.href === "/dashboard")).toBe(true);
  });

  it("syncs active hash from the browser and unregisters the listener", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", {
      location: { hash: "#preview" },
      addEventListener,
      removeEventListener,
    });

    const { setter, cleanup } = renderMobileNav({}, { runEffects: true });
    expect(setter).toHaveBeenCalledWith("preview");
    expect(addEventListener).toHaveBeenCalledWith("hashchange", expect.any(Function));

    cleanup?.();
    expect(removeEventListener).toHaveBeenCalledWith("hashchange", expect.any(Function));
  });
});
