import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buttonProps: null as any,
  theme: "dark" as string,
  setTheme: vi.fn(),
  effects: [] as Array<() => void | (() => void)>,
  applyTheme: vi.fn(),
  persistTheme: vi.fn(),
  currentTheme: "dark" as "dark" | "light",
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: () => [mocks.theme, mocks.setTheme],
    useEffect: (effect: () => void | (() => void)) => {
      mocks.effects.push(effect);
    },
  };
});

vi.mock("lucide-react", async () => {
  const ReactModule = await import("react");
  return {
    Sun: (props: any) => ReactModule.createElement("svg", { className: props.className, "data-icon": "sun" }),
    Moon: (props: any) => ReactModule.createElement("svg", { className: props.className, "data-icon": "moon" }),
  };
});

vi.mock("@subboost/ui/components/ui/icon-button", async () => {
  const ReactModule = await import("react");
  return {
    IconButton: ({ label, title, children, ...props }: any) => {
      mocks.buttonProps = { label, title, ...props };
      return ReactModule.createElement(
        "button",
        { "aria-label": label, title, "aria-pressed": props["aria-pressed"], className: props.className },
        children
      );
    },
  };
});

vi.mock("@subboost/ui/theme/theme", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@subboost/ui/theme/theme")>();
  return {
    ...actual,
    applyTheme: mocks.applyTheme,
    persistTheme: mocks.persistTheme.mockImplementation(actual.persistTheme),
    getCurrentTheme: () => mocks.currentTheme,
  };
});

import { ThemeToggle } from "./theme-toggle";

function render(theme: "dark" | "light") {
  mocks.theme = theme;
  mocks.effects = [];
  return renderToStaticMarkup(React.createElement(ThemeToggle));
}

function installBrowser({
  stored,
  system = "dark",
  api = "modern",
  storageFailure,
}: {
  stored?: string;
  system?: "dark" | "light";
  api?: "modern" | "legacy" | "missing" | "throws";
  storageFailure?: "getter" | "read" | "write";
} = {}) {
  const values = new Map(stored ? [["subboost-theme", stored]] : []);
  const localStorage = {
    getItem: vi.fn((key: string) => {
      if (storageFailure === "read") throw new Error("blocked read");
      return values.get(key) ?? null;
    }),
    setItem: vi.fn((key: string, value: string) => {
      if (storageFailure === "write") throw new Error("blocked write");
      values.set(key, value);
    }),
  };
  const storageListeners = new Map<string, (event: any) => void>();
  const mediaListeners = new Set<() => void>();
  const addMedia = vi.fn((...args: any[]) => mediaListeners.add(args.at(-1)));
  const removeMedia = vi.fn((...args: any[]) => mediaListeners.delete(args.at(-1)));
  const media = {
    matches: system === "light",
    ...(api === "modern" ? { addEventListener: addMedia, removeEventListener: removeMedia } : {}),
    ...(api === "legacy" ? { addListener: addMedia, removeListener: removeMedia } : {}),
  };
  const browser = {
    get localStorage() {
      if (storageFailure === "getter") throw new Error("blocked getter");
      return localStorage;
    },
    addEventListener: vi.fn((name: string, listener: (event: any) => void) => storageListeners.set(name, listener)),
    removeEventListener: vi.fn((name: string) => storageListeners.delete(name)),
    ...(api === "missing" ? {} : {
      matchMedia: vi.fn(() => {
        if (api === "throws") throw new Error("unavailable system API");
        return media;
      }),
    }),
  };
  vi.stubGlobal("window", browser);
  return {
    browser, localStorage, addMedia, removeMedia, mediaListeners, storageListeners,
    systemChange: (theme: "dark" | "light") => {
      media.matches = theme === "light";
      for (const listener of mediaListeners) listener();
    },
    storageEvent: (event: any) => storageListeners.get("storage")!(event),
  };
}

function mount() {
  render("dark");
  return mocks.effects[0]() as () => void;
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentTheme = "dark";
    mocks.applyTheme.mockImplementation((theme) => { mocks.currentTheme = theme; });
    installBrowser();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes a stable name, pressed state and both icons in dark", () => {
    const html = render("dark");

    expect(html).toContain('aria-label="浅色主题"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('title="切换到浅色"');
    expect(html).toContain('data-icon="sun"');
    expect(html).toContain('data-icon="moon"');
    expect(html).toContain("theme-when-dark");
    expect(html).toContain("theme-when-light");
    expect(mocks.buttonProps.variant).toBe("ghost");
  });

  it("reports the light state", () => {
    const html = render("light");

    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('title="切换到深色"');
  });

  it("toggles, applies and stores the next theme", () => {
    render("dark");
    mocks.buttonProps.onClick();
    expect(mocks.applyTheme).toHaveBeenCalledWith("light");
    expect(mocks.persistTheme).toHaveBeenCalledWith("light");
    expect(mocks.setTheme).toHaveBeenCalledWith("light");

    mocks.currentTheme = "light";
    mocks.buttonProps.onClick();
    expect(mocks.applyTheme).toHaveBeenLastCalledWith("dark");
    expect(mocks.persistTheme).toHaveBeenLastCalledWith("dark");
  });

  it("applies the stored choice on mount, synchronizing meta and state", () => {
    const browser = installBrowser({ stored: "light", system: "dark" });
    const cleanup = mount();
    expect(mocks.applyTheme).toHaveBeenCalledWith("light");
    expect(mocks.setTheme).toHaveBeenCalledWith("light");
    browser.systemChange("light");
    browser.systemChange("dark");
    expect(mocks.applyTheme).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it.each(["light", "dark"] as const)("follows initial and live system %s without persisting", (system) => {
    const browser = installBrowser({ system });
    mount();
    expect(mocks.currentTheme).toBe(system);
    browser.systemChange(system === "light" ? "dark" : "light");
    expect(mocks.currentTheme).toBe(system === "light" ? "dark" : "light");
    expect(mocks.persistTheme).not.toHaveBeenCalled();
    expect(browser.localStorage.setItem).not.toHaveBeenCalled();
  });

  it("treats an invalid stored value as system-following", () => {
    const browser = installBrowser({ stored: "system", system: "light" });
    mount();
    expect(mocks.currentTheme).toBe("light");
    browser.systemChange("dark");
    expect(mocks.currentTheme).toBe("dark");
  });

  it("keeps a successful manual choice when the system changes", () => {
    const browser = installBrowser({ system: "light" });
    mount();
    mocks.buttonProps.onClick();
    expect(mocks.currentTheme).toBe("dark");
    expect(browser.localStorage.getItem("subboost-theme")).toBe("dark");
    browser.systemChange("dark");
    browser.systemChange("light");
    expect(mocks.currentTheme).toBe("dark");
  });

  it.each(["getter", "read", "write"] as const)("keeps the current-page manual choice if storage %s fails", (storageFailure) => {
    const browser = installBrowser({ system: "light", storageFailure });
    expect(mount).not.toThrow();
    expect(mocks.currentTheme).toBe("light");
    expect(() => mocks.buttonProps.onClick()).not.toThrow();
    expect(mocks.currentTheme).toBe("dark");
    browser.systemChange("dark");
    browser.systemChange("light");
    expect(mocks.currentTheme).toBe("dark");
  });

  it("syncs other tabs' manual choices and ignores later system changes", () => {
    const browser = installBrowser({ system: "light" });
    mount();
    browser.storageEvent({ key: "subboost-theme", newValue: "dark", storageArea: browser.localStorage });
    expect(mocks.applyTheme).toHaveBeenLastCalledWith("dark");
    expect(mocks.setTheme).toHaveBeenLastCalledWith("dark");
    browser.systemChange("dark");
    browser.systemChange("light");
    expect(mocks.currentTheme).toBe("dark");
  });

  it.each([
    { key: "subboost-theme", newValue: null },
    { key: "subboost-theme", newValue: "invalid" },
    { key: null, newValue: null },
  ])("resumes system-following after another tab clears or invalidates the choice: %j", (event) => {
    const browser = installBrowser({ system: "light", stored: "dark" });
    mount();
    browser.storageEvent(event);
    expect(mocks.currentTheme).toBe("light");
    browser.systemChange("dark");
    expect(mocks.currentTheme).toBe("dark");
    expect(mocks.persistTheme).not.toHaveBeenCalled();
  });

  it("ignores unrelated keys, session storage, and unverifiable storage events", () => {
    const browser = installBrowser({ system: "light" });
    mount();
    browser.storageEvent({ key: "other-key", newValue: "dark" });
    browser.storageEvent({ key: "subboost-theme", newValue: "dark", storageArea: {} });
    expect(mocks.currentTheme).toBe("light");

    const blocked = installBrowser({ system: "light", storageFailure: "getter" });
    mount();
    blocked.storageEvent({ key: "subboost-theme", newValue: "dark", storageArea: blocked.localStorage });
    expect(mocks.currentTheme).toBe("light");
  });

  it.each(["modern", "legacy"] as const)("cleans up %s system and storage listeners on unmount", (api) => {
    const browser = installBrowser({ api, system: "light" });
    const cleanup = mount();
    expect(browser.addMedia).toHaveBeenCalledTimes(1);
    browser.systemChange("dark");
    expect(mocks.currentTheme).toBe("dark");
    cleanup();
    expect(browser.removeMedia).toHaveBeenCalledTimes(1);
    expect(browser.browser.removeEventListener).toHaveBeenCalledWith("storage", expect.any(Function));
    expect(browser.mediaListeners.size).toBe(0);
    expect(browser.storageListeners.size).toBe(0);
    browser.systemChange("light");
    expect(mocks.currentTheme).toBe("dark");
  });

  it.each(["missing", "throws"] as const)("falls back safely if the system API is %s", (api) => {
    installBrowser({ api });
    const cleanup = mount();
    expect(mocks.currentTheme).toBe("dark");
    mocks.buttonProps.onClick();
    expect(mocks.currentTheme).toBe("light");
    expect(cleanup).not.toThrow();
  });
});
