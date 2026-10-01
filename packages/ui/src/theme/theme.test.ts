import { afterEach, describe, expect, it, vi } from "vitest";
import { SUBBOOST_THEME_COLOR } from "@subboost/ui/brand";
import {
  applyTheme,
  DEFAULT_THEME,
  getCurrentTheme,
  getSystemTheme,
  getSystemThemeQuery,
  parseTheme,
  persistTheme,
  readStoredTheme,
  THEME_META_COLORS,
  THEME_STORAGE_KEY,
  SYSTEM_THEME_QUERY,
} from "./theme";
import { THEME_INIT_SCRIPT } from "./theme-init-script";

type FakeElement = {
  attributes: Map<string, string>;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
};

function fakeElement(): FakeElement {
  const attributes = new Map<string, string>();
  return {
    attributes,
    setAttribute: (name, value) => void attributes.set(name, value),
    getAttribute: (name) => attributes.get(name) ?? null,
  };
}

function installDom({ withMeta = true }: { withMeta?: boolean } = {}) {
  const root = fakeElement();
  const meta = fakeElement();
  meta.setAttribute("content", "#000000");
  const document = {
    documentElement: root,
    querySelector: vi.fn((selector: string) =>
      withMeta && selector === 'meta[name="theme-color"]' ? meta : null
    ),
  };
  vi.stubGlobal("document", document);
  return { root, meta };
}

function installStorage(storage: Partial<Storage> | "throws") {
  const localStorage =
    storage === "throws"
      ? {
          getItem: () => {
            throw new Error("blocked");
          },
          setItem: () => {
            throw new Error("blocked");
          },
        }
      : storage;
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("window", { localStorage });
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => void values.set(key, value)),
  };
}

function installSystem(theme: "light" | "dark" | "throws") {
  const matchMedia = vi.fn(() => {
    if (theme === "throws") throw new Error("unavailable");
    return { matches: theme === "light" };
  });
  vi.stubGlobal("window", { ...window, matchMedia });
  return matchMedia;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("theme helpers", () => {
  it("accepts only dark and light", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    for (const value of ["", "Dark", "system", null, undefined, 1, {}]) {
      expect(parseTheme(value)).toBeNull();
    }
  });

  it("reads and persists the stored choice", () => {
    const storage = memoryStorage({ [THEME_STORAGE_KEY]: "light" });
    installStorage(storage);
    expect(readStoredTheme()).toBe("light");

    persistTheme("dark");
    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, "dark");
    expect(readStoredTheme()).toBe("dark");
  });

  it("treats invalid or unavailable storage as no choice without throwing", () => {
    installStorage(memoryStorage({ [THEME_STORAGE_KEY]: "neon" }));
    expect(readStoredTheme()).toBeNull();

    installStorage("throws");
    expect(readStoredTheme()).toBeNull();
    expect(() => persistTheme("light")).not.toThrow();
  });

  it.each(["light", "dark"] as const)("reads the %s system preference", (theme) => {
    installStorage(memoryStorage());
    const matchMedia = installSystem(theme);
    expect(getSystemTheme()).toBe(theme);
    expect(matchMedia).toHaveBeenCalledWith(SYSTEM_THEME_QUERY);
    expect(getSystemThemeQuery()?.matches).toBe(theme === "light");
  });

  it("falls back to dark when the system preference API is missing or throws", () => {
    installStorage(memoryStorage());
    expect(getSystemThemeQuery()).toBeNull();
    expect(getSystemTheme()).toBe("dark");

    installSystem("throws");
    expect(getSystemThemeQuery()).toBeNull();
    expect(getSystemTheme()).toBe("dark");
  });

  it("handles an unavailable storage getter without preventing system preference reads", () => {
    vi.stubGlobal("window", {
      get localStorage() { throw new Error("blocked getter"); },
      matchMedia: () => ({ matches: true }),
    });
    expect(readStoredTheme()).toBeNull();
    expect(() => persistTheme("dark")).not.toThrow();
    expect(getSystemTheme()).toBe("light");
  });

  it("applies the theme to the root element and theme-color meta", () => {
    const { root, meta } = installDom();

    applyTheme("light");
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(meta.getAttribute("content")).toBe(THEME_META_COLORS.light);
    expect(getCurrentTheme()).toBe("light");

    applyTheme("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(meta.getAttribute("content")).toBe(SUBBOOST_THEME_COLOR);
  });

  it("applies the theme when the meta tag is missing and falls back to the default theme", () => {
    const { root } = installDom({ withMeta: false });
    expect(getCurrentTheme()).toBe(DEFAULT_THEME);

    applyTheme("light");
    expect(root.getAttribute("data-theme")).toBe("light");

    root.setAttribute("data-theme", "sepia");
    expect(getCurrentTheme()).toBe(DEFAULT_THEME);
  });
});

describe("THEME_INIT_SCRIPT", () => {
  const run = () => new Function(THEME_INIT_SCRIPT)();

  it.each([
    ["light", "dark", "light"],
    ["dark", "light", "dark"],
    ["system", "light", "light"],
    ["system", "dark", "dark"],
  ] as const)("prefers stored %s over system %s, resolving to %s", (stored, system, expected) => {
    const { root, meta } = installDom();
    installStorage(memoryStorage({ [THEME_STORAGE_KEY]: stored }));
    installSystem(system);

    run();

    expect(root.getAttribute("data-theme")).toBe(expected);
    expect(meta.getAttribute("content")).toBe(THEME_META_COLORS[expected as "dark" | "light"]);
  });

  it.each(["light", "dark"] as const)("uses system %s when nothing is stored without persisting it", (system) => {
    const { root } = installDom();
    const storage = memoryStorage();
    installStorage(storage);
    installSystem(system);

    run();

    expect(root.getAttribute("data-theme")).toBe(system);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("still uses system light when storage methods throw", () => {
    const { root, meta } = installDom();
    root.setAttribute("data-theme", "dark");
    installStorage("throws");
    installSystem("light");

    expect(run).not.toThrow();
    expect(root.getAttribute("data-theme")).toBe("light");
    expect(meta.getAttribute("content")).toBe(THEME_META_COLORS.light);
  });

  it("still uses system light when the storage getter throws", () => {
    const { root } = installDom();
    vi.stubGlobal("window", {
      get localStorage() { throw new Error("blocked getter"); },
      matchMedia: () => ({ matches: true }),
    });
    expect(run).not.toThrow();
    expect(root.getAttribute("data-theme")).toBe("light");
  });

  it.each([false, true])("safely falls back to dark when system API fails (throws=%s)", (throws) => {
    const { root, meta } = installDom();
    installStorage(memoryStorage());
    if (throws) installSystem("throws");
    expect(run).not.toThrow();
    expect(root.getAttribute("data-theme")).toBe(DEFAULT_THEME);
    expect(meta.getAttribute("content")).toBe(THEME_META_COLORS.dark);
  });

  it("works before the theme-color meta tag is parsed", () => {
    const { root } = installDom({ withMeta: false });
    installStorage(memoryStorage({ [THEME_STORAGE_KEY]: "light" }));

    run();

    expect(root.getAttribute("data-theme")).toBe("light");
  });
});
