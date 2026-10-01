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
    persistTheme: mocks.persistTheme,
    getCurrentTheme: () => mocks.currentTheme,
  };
});

import { ThemeToggle } from "./theme-toggle";

function render(theme: "dark" | "light") {
  mocks.theme = theme;
  mocks.effects = [];
  return renderToStaticMarkup(React.createElement(ThemeToggle));
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentTheme = "dark";
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

  it("syncs from the document on mount and follows other tabs", () => {
    const listeners = new Map<string, (event: any) => void>();
    const removeEventListener = vi.fn();
    vi.stubGlobal("window", {
      addEventListener: (name: string, listener: (event: any) => void) => listeners.set(name, listener),
      removeEventListener,
    });
    mocks.currentTheme = "light";

    render("dark");
    const cleanup = mocks.effects[0]();
    expect(mocks.applyTheme).toHaveBeenCalledWith("light");
    expect(mocks.setTheme).toHaveBeenCalledWith("light");

    const onStorage = listeners.get("storage")!;
    onStorage({ key: "other-key", newValue: "dark" });
    expect(mocks.applyTheme).toHaveBeenCalledTimes(1);

    onStorage({ key: "subboost-theme", newValue: "dark" });
    expect(mocks.applyTheme).toHaveBeenLastCalledWith("dark");
    expect(mocks.setTheme).toHaveBeenLastCalledWith("dark");

    onStorage({ key: "subboost-theme", newValue: null });
    expect(mocks.applyTheme).toHaveBeenLastCalledWith("dark");

    (cleanup as () => void)();
    expect(removeEventListener).toHaveBeenCalledWith("storage", onStorage);
  });
});
