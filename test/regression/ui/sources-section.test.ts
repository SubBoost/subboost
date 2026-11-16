// @ts-expect-error public coverage tests render with the public React runtime.
import * as React from "../../../node_modules/react";
// @ts-expect-error public coverage tests render with the public ReactDOM server runtime.
import { renderToStaticMarkup } from "../../../node_modules/react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  nativeButtons: [] as Array<Record<string, any>>,
  uiButtons: [] as Array<Record<string, any>>,
  inputs: [] as Array<Record<string, any>>,
  switches: [] as Array<Record<string, any>>,
  textareas: [] as Array<Record<string, any>>,
  dialogs: [] as Array<Record<string, any>>,
  addSourceMenus: [] as Array<Record<string, any>>,
  sourceTypeChoices: [] as Array<Record<string, any>>,
  setSources: vi.fn(),
  parseSingleSource: vi.fn(),
  sourceAdded: vi.fn(),
  sourceImported: vi.fn(),
  toast: vi.fn(),
  user: null as any,
  storeState: null as any,
}));

const stateMock = vi.hoisted(() => ({
  enabled: false,
  callIndex: 0,
  overrides: {} as Record<number, unknown>,
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useState: (initial: unknown) => {
      if (!stateMock.enabled) return actual.useState(initial);
      const index = stateMock.callIndex++;
      const value = Object.prototype.hasOwnProperty.call(stateMock.overrides, index)
        ? stateMock.overrides[index]
        : initial;
      const setter = vi.fn((next: unknown) => {
        const resolved = typeof next === "function" ? (next as (prev: unknown) => unknown)(value) : next;
        (setter as any).lastValue = resolved;
        return resolved;
      });
      stateMock.setters[index] = setter;
      return [value, setter];
    },
  };
});

vi.mock("../../../node_modules/react/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    useState: (initial: unknown) => {
      if (!stateMock.enabled) return actual.useState(initial);
      const index = stateMock.callIndex++;
      const value = Object.prototype.hasOwnProperty.call(stateMock.overrides, index)
        ? stateMock.overrides[index]
        : initial;
      const setter = vi.fn((next: unknown) => {
        const resolved = typeof next === "function" ? (next as (prev: unknown) => unknown)(value) : next;
        (setter as any).lastValue = resolved;
        return resolved;
      });
      stateMock.setters[index] = setter;
      return [value, setter];
    },
  };
});

vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react/jsx-runtime")>();
  const capture = (type: any, props: any, key?: any) => {
    if (type === "button") mocks.nativeButtons.push({ ...(props || {}), key });
  };
  return {
    ...actual,
    jsx: (type: any, props: any, key?: any) => {
      capture(type, props, key);
      return actual.jsx(type, props, key);
    },
    jsxs: (type: any, props: any, key?: any) => {
      capture(type, props, key);
      return actual.jsxs(type, props, key);
    },
  };
});

vi.mock(
  "../../../node_modules/react/jsx-runtime.js",
  async (importOriginal) => {
    const actual = await importOriginal<typeof import("react/jsx-runtime")>();
    const capture = (type: any, props: any, key?: any) => {
      if (type === "button") mocks.nativeButtons.push({ ...(props || {}), key });
    };
    return {
      ...actual,
      jsx: (type: any, props: any, key?: any) => {
        capture(type, props, key);
        return actual.jsx(type, props, key);
      },
      jsxs: (type: any, props: any, key?: any) => {
        capture(type, props, key);
        return actual.jsxs(type, props, key);
      },
    };
  }
);

vi.mock("lucide-react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("lucide-react")>()),
  AlertCircle: () => React.createElement("span", null, "alert"),
  Check: () => React.createElement("span", null, "check"),
  ChevronDown: () => React.createElement("span", null, "down"),
  ChevronUp: () => React.createElement("span", null, "up"),
  FileCode: () => React.createElement("span", null, "file"),
  HelpCircle: () => React.createElement("span", null, "help"),
  Link2: () => React.createElement("span", null, "link"),
  Loader2: () => React.createElement("span", null, "loader"),
  Maximize2: () => React.createElement("span", null, "expand"),
  Menu: () => React.createElement("span", null, "menu"),
  Plus: () => React.createElement("span", null, "plus"),
  Server: () => React.createElement("span", null, "server"),
  X: () => React.createElement("span", null, "x"),
}));

vi.mock("@radix-ui/react-popover", () => ({
  Root: ({ children }: React.PropsWithChildren) => React.createElement("div", null, children),
  Trigger: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
  Anchor: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
  Close: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
  Portal: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
  Content: ({ children }: React.PropsWithChildren) => React.createElement("section", null, children),
  Arrow: () => React.createElement("span", null, "arrow"),
}));

vi.mock("@subboost/ui/components/ui/badge", () => ({
  Badge: (props: any) => React.createElement("span", props, props.children),
}));

vi.mock("@subboost/ui/components/ui/button", () => ({
  Button: (props: any) => {
    mocks.uiButtons.push(props);
    return React.createElement("button", props, props.children);
  },
}));

vi.mock("@subboost/ui/components/ui/dialog", () => ({
  Dialog: (props: any) => {
    mocks.dialogs.push(props);
    return React.createElement("div", { "data-open": props.open }, props.children);
  },
  DialogContent: (props: any) => React.createElement("section", props, props.children),
  DialogBody: (props: any) => React.createElement("div", props, props.children),
  DialogHeader: (props: any) => React.createElement("header", props, props.children),
  DialogTitle: (props: any) => React.createElement("h2", props, props.children),
}));

vi.mock("@subboost/ui/components/ui/input", () => ({
  Input: (props: any) => {
    mocks.inputs.push(props);
    return React.createElement("input", props);
  },
}));

vi.mock("@subboost/ui/components/ui/switch", () => ({
  Switch: (props: any) => {
    mocks.switches.push(props);
    return React.createElement("button", {
      type: "button",
      "aria-pressed": props.checked,
      onClick: () => props.onCheckedChange?.(!props.checked),
    });
  },
}));

vi.mock("@subboost/ui/components/ui/textarea", () => ({
  Textarea: (props: any) => {
    mocks.textareas.push(props);
    return React.createElement("textarea", props);
  },
}));

vi.mock("@subboost/ui/components/ui/toaster", () => ({ toast: mocks.toast }));

vi.mock("@subboost/ui/product/converter/subscription-import-error", () => ({
  SubscriptionImportErrorBadge: ({ errorMessage }: { errorMessage?: string }) =>
    React.createElement("span", null, `import-error:${errorMessage ?? ""}`),
}));
vi.mock("@subboost/ui/product/converter/source-controls", () => ({
  AddSourceMenu: (props: any) => {
    mocks.addSourceMenus.push(props);
    return null;
  },
  SourceStatusPopover: ({ source }: any) => source.parsed && source.nodeCount !== undefined
    ? React.createElement("span", null, `✓ ${source.nodeCount} 节点`)
    : null,
  SourceTypeChoices: (props: any) => {
    mocks.sourceTypeChoices.push(props);
    return null;
  },
}));

vi.mock("@subboost/ui/product/interactions", () => ({
  useProductInteractionAdapter: () => ({
    sourceAdded: mocks.sourceAdded,
    sourceImported: mocks.sourceImported,
  }),
}));

vi.mock("@subboost/ui/product/subscription/subscription-userinfo-display", () => ({
  getSubscriptionUserInfoDisplay: (info: unknown) => {
    if (info === "traffic-only") return { traffic: "1 GB / 10 GB", expire: "" };
    if (info === "expire-only") return { traffic: "", expire: "2026-12-31" };
    return info ? { traffic: "1 GB / 10 GB", expire: "2026-12-31" } : null;
  },
}));

vi.mock("@subboost/ui/store/config-store", () => {
  const useConfigStore = () => mocks.storeState;
  useConfigStore.getState = () => mocks.storeState;
  return {
    getNodeSourceIds: (node: Record<string, unknown>) => (Array.isArray(node.sourceIds) ? node.sourceIds : []),
    useConfigStore,
  };
});

vi.mock("@subboost/ui/store/user-store", () => ({
  useUserStore: () => ({ user: mocks.user }),
}));

import { SourcesSection } from "../../../packages/ui/src/product/converter/quick-mode/sources-section";

function createSources() {
  return [
    {
      id: "url-1",
      type: "url",
      content: "https://example.com/sub.yaml",
      tag: "A",
      nameTemplate: "{tag}-{name}",
      useProxyProviders: true,
      userinfoUrl: "https://example.com/userinfo",
      userinfoUserAgent: "clash.meta",
      parsed: true,
      nodeCount: 2,
      subscriptionUserInfo: { upload: 1, download: 2, total: 10 },
    },
    {
      id: "url-2",
      type: "url",
      content: "https://backup.example.com/sub.yaml",
      parsed: false,
      error: "backup failed",
    },
    {
      id: "nodes-1",
      type: "nodes",
      content: "ss://node",
      parsing: true,
    },
  ];
}

function renderWithState(overrides: Record<number, unknown> = {}) {
  stateMock.enabled = true;
  stateMock.callIndex = 0;
  stateMock.overrides = overrides;
  stateMock.setters = [];
  mocks.nativeButtons = [];
  mocks.uiButtons = [];
  mocks.inputs = [];
  mocks.switches = [];
  mocks.textareas = [];
  mocks.dialogs = [];
  mocks.addSourceMenus = [];
  mocks.sourceTypeChoices = [];
  try {
    const html = renderToStaticMarkup(React.createElement(SourcesSection));
    return { html, setters: stateMock.setters };
  } finally {
    stateMock.enabled = false;
  }
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("public SourcesSection branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.storeState = {
      nodes: [{ name: "Node A", sourceIds: ["url-1"] }],
      parseErrors: [{ message: "top level parse failed" }],
      sources: createSources(),
      setSources: mocks.setSources,
      parseSingleSource: mocks.parseSingleSource,
    };
  });

  it("renders source status branches and exercises source list interactions", async () => {
    const { html } = renderWithState({ 0: true });

    expect(html).toContain("import-error:backup failed");
    expect(html).toContain("1 个节点已解析");

    mocks.addSourceMenus[0].onAdd("url");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "warning" }));

    mocks.addSourceMenus[0].onAdd("yaml");
    expect(mocks.setSources).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ type: "yaml" })]));
    expect(mocks.sourceAdded).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "yaml" }));

    mocks.sourceTypeChoices[0].onChange("yaml");
    expect(mocks.setSources).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "url-1", type: "yaml", content: "" })])
    );

    const firstUrlInput = mocks.inputs.find((input) => input.placeholder === "https://example.com/sub?token=xxx");
    firstUrlInput?.onChange({ target: { value: "https://changed.example.com/sub.yaml" } });
    expect(mocks.setSources).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "url-1",
          content: "https://changed.example.com/sub.yaml",
          parsed: false,
          parsing: false,
        }),
      ])
    );

    mocks.uiButtons.find((button) => button.title === "删除导入源")?.onClick();
    expect(mocks.setSources).toHaveBeenCalledWith(
      expect.not.arrayContaining([expect.objectContaining({ id: "url-1" })])
    );

    const moveDown = mocks.uiButtons.find((button) => button.title === "下移" && !button.disabled);
    moveDown?.onClick();
    expect(mocks.setSources).toHaveBeenCalledWith([
      expect.objectContaining({ id: "url-2" }),
      expect.objectContaining({ id: "url-1" }),
      expect.objectContaining({ id: "nodes-1" }),
    ]);

    mocks.parseSingleSource.mockResolvedValueOnce(undefined);
    const importParsed = mocks.uiButtons.find((button) => button.title === "重新导入");
    importParsed?.onClick();
    await flushAsyncWork();
    expect(mocks.parseSingleSource).toHaveBeenCalledWith("url-1");
    expect(mocks.sourceImported).toHaveBeenCalledWith(expect.objectContaining({ result: "success", sourceType: "url" }));
  });

  it("updates expanded URL metadata and reimports changed sources on close", () => {
    const { setters } = renderWithState({
      1: "url-1",
      2: {
        id: "url-1",
        content: "https://old.example.com/sub.yaml",
        tag: "Old",
        nameTemplate: "{name}",
        useProxyProviders: false,
        userinfoUrl: "",
        userinfoUserAgent: "",
      },
    });

    const tagInput = mocks.inputs.find((input) => input.placeholder === "例如：A / 订阅1 / 自建1");
    tagInput?.onChange({ target: { value: "Premium" } });
    expect(mocks.setSources).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: "url-1",
          tag: "Premium",
          parsed: false,
          parsing: false,
        }),
      ])
    );

    mocks.switches[0]?.onCheckedChange(false);
    expect(mocks.setSources).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "url-1", useProxyProviders: false })])
    );

    const userinfoInput = mocks.inputs.find((input) => input.placeholder === "留空则默认使用当前订阅源 URL");
    userinfoInput?.onChange({ target: { value: "https://info.example.com" } });
    expect(mocks.setSources).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "url-1", userinfoUrl: "https://info.example.com" })])
    );

    const userAgentInput = mocks.inputs.find((input) => input.placeholder === "例如 clash.meta/v1.19.16");
    userAgentInput?.onChange({ target: { value: "mihomo/1.0" } });
    expect(mocks.setSources).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "url-1", userinfoUserAgent: "mihomo/1.0" })])
    );

    const done = mocks.uiButtons.find((button) => button.children === "完成");
    done?.onClick();
    expect(mocks.parseSingleSource).toHaveBeenCalledWith("url-1");
    expect(setters[1]).toHaveBeenCalledWith(null);
  });

  it("does not reimport unchanged expanded sources or rewrite unchanged source fields", () => {
    const { setters } = renderWithState({
      1: "url-1",
      2: {
        id: "url-1",
        content: "https://example.com/sub.yaml",
        tag: "A",
        nameTemplate: "{tag}-{name}",
        useProxyProviders: true,
        userinfoUrl: "https://example.com/userinfo",
        userinfoUserAgent: "clash.meta",
      },
    });

    mocks.setSources.mockClear();
    mocks.parseSingleSource.mockClear();

    mocks.sourceTypeChoices[0].onChange("url");
    expect(mocks.setSources).not.toHaveBeenCalled();

    const firstUrlInput = mocks.inputs.find((input) => input.placeholder === "https://example.com/sub?token=xxx");
    firstUrlInput?.onChange({ target: { value: "https://example.com/sub.yaml" } });
    expect(mocks.setSources).toHaveBeenCalledWith(mocks.storeState.sources);

    mocks.setSources.mockClear();
    const done = mocks.uiButtons.find((button) => button.children === "完成");
    done?.onClick();
    expect(mocks.parseSingleSource).not.toHaveBeenCalled();
    expect(setters[1]).toHaveBeenCalledWith(null);
  });

  it("uses the authenticated fallback quota when the quota payload is invalid", () => {
    mocks.user = { isAdmin: false, quota: { maxImportSourcesPerType: Number.NaN } };
    mocks.storeState = {
      ...mocks.storeState,
      sources: [{ id: "yaml-1", type: "yaml", content: "proxies: []", parsed: false }],
      nodes: [],
      parseErrors: [],
    };
    renderWithState({ 0: true });

    mocks.addSourceMenus[0].onAdd("url");

    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.setSources).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ type: "url" })]));
  });

  it("uses admin quota and validation-error import telemetry branches", async () => {
    mocks.user = { isAdmin: true, quota: { maxImportSourcesPerType: 0 } };
    mocks.storeState = {
      ...mocks.storeState,
      sources: [{ id: "yaml-1", type: "yaml", content: "proxies: []", parsed: false }],
      nodes: [],
      parseErrors: [],
    };
    renderWithState({ 0: true });

    mocks.addSourceMenus[0].onAdd("url");
    expect(mocks.setSources).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ type: "url" })]));

    mocks.parseSingleSource.mockResolvedValueOnce(undefined);
    const importButton = mocks.uiButtons.find((button) => button.title === "导入此源");
    importButton?.onClick();
    await flushAsyncWork();

    expect(mocks.sourceImported).toHaveBeenCalledWith(
      expect.objectContaining({ result: "validationError", sourceType: "yaml", sourceCount: 1 })
    );
  });

  it("blocks source type switching when the target type quota is already full", () => {
    mocks.user = null;
    mocks.storeState = {
      ...mocks.storeState,
      sources: [
        { id: "url-1", type: "url", content: "https://example.com/sub.yaml", parsed: false },
        { id: "yaml-1", type: "yaml", content: "proxies: []", parsed: false },
        { id: "yaml-2", type: "yaml", content: "proxies: []", parsed: false },
      ],
      nodes: [],
      parseErrors: [],
    };
    renderWithState();

    mocks.sourceTypeChoices[0].onChange("yaml");

    expect(mocks.toast).toHaveBeenCalledWith({
      title: "未登录用户每种导入方式最多 2 个（登录后可提升）",
      variant: "warning",
    });
    expect(mocks.setSources).not.toHaveBeenCalled();
  });

  it("uses the original source as import telemetry fallback when it disappears after parsing", async () => {
    let resolveParse: () => void = () => undefined;
    mocks.storeState = {
      ...mocks.storeState,
      sources: [{ id: "gone", type: "url", content: "https://gone.example.com/sub.yaml", parsed: false }],
      nodes: [],
      parseErrors: [],
    };
    mocks.parseSingleSource.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveParse = resolve;
    }));
    renderWithState();

    const importButton = mocks.uiButtons.find((button) => button.title === "导入此源");
    importButton?.onClick();
    mocks.storeState.sources = [];
    resolveParse();
    await flushAsyncWork();

    expect(mocks.sourceImported).toHaveBeenCalledWith(
      expect.objectContaining({
        result: "validationError",
        sourceCount: 0,
        sourceType: "url",
      })
    );
  });

  it("covers expanded source snapshot reuse, blank optional metadata, and dialog-close reimport", () => {
    const snapshot = {
      id: "url-empty",
      content: "https://old.example.com/sub.yaml",
      tag: "",
      nameTemplate: "",
      useProxyProviders: false,
      userinfoUrl: "",
      userinfoUserAgent: "",
    };
    mocks.storeState = {
      ...mocks.storeState,
      sources: [
        {
          id: "url-empty",
          type: "url",
          content: "https://empty.example.com/sub.yaml",
          parsed: true,
          nodeCount: 1,
          subscriptionUserInfo: null,
        },
      ],
      nodes: [],
      parseErrors: [],
    };

    const { html, setters } = renderWithState({ 1: "url-empty", 2: snapshot });

    expect(setters[2].mock.results.at(-1)?.value).toBe(snapshot);
    expect(html).toContain("✓ 1 节点");

    mocks.dialogs[0].onOpenChange(false);
    expect(mocks.parseSingleSource).toHaveBeenCalledWith("url-empty");
    expect(setters[1]).toHaveBeenCalledWith(null);
  });

  it("builds expanded source snapshots from sparse source metadata and keeps open dialogs untouched", () => {
    const previousSnapshot = {
      id: "url-sparse",
      content: "https://previous.example.com/sub.yaml",
      tag: "Previous",
      nameTemplate: "{name}",
      useProxyProviders: true,
      userinfoUrl: "https://previous.example.com/userinfo",
      userinfoUserAgent: "mihomo",
    };
    mocks.storeState = {
      ...mocks.storeState,
      sources: [
        {
          id: "url-sparse",
          type: "url",
          content: "https://sparse.example.com/sub.yaml",
          parsed: true,
          nodeCount: 1,
          subscriptionUserInfo: "expire-only",
        },
      ],
      nodes: [],
      parseErrors: [],
    };

    const { setters } = renderWithState({ 1: "url-sparse", 2: null });
    const snapshotUpdater = setters[2].mock.calls.at(-1)?.[0] as (prev: unknown) => unknown;

    expect(snapshotUpdater(previousSnapshot)).toBe(previousSnapshot);
    expect(snapshotUpdater(null)).toEqual({
      id: "url-sparse",
      content: "https://sparse.example.com/sub.yaml",
      tag: "",
      nameTemplate: "",
      useProxyProviders: false,
      userinfoUrl: "",
      userinfoUserAgent: "",
    });
    mocks.dialogs[0].onOpenChange(true);
    expect(mocks.parseSingleSource).not.toHaveBeenCalled();
  });

  it("keeps single-source deletes and blocked imports as no-ops, then records runtime import failures", async () => {
    mocks.storeState = {
      ...mocks.storeState,
      sources: [{ id: "only", type: "url", content: "", parsed: false }],
      nodes: [],
      parseErrors: [],
    };
    renderWithState();

    expect(mocks.uiButtons.find((button) => button.title === "删除导入源")).toBeUndefined();
    expect(mocks.setSources).not.toHaveBeenCalled();

    expect(mocks.uiButtons.find((button) => button.title === "导入此源")?.disabled).toBe(true);
    await flushAsyncWork();
    expect(mocks.parseSingleSource).not.toHaveBeenCalled();

    mocks.storeState = {
      ...mocks.storeState,
      sources: [{ id: "busy", type: "nodes", content: "ss://node", parsing: true, parsed: false }],
    };
    renderWithState();
    expect(mocks.uiButtons.find((button) => button.title === "导入中...")?.disabled).toBe(true);
    await flushAsyncWork();
    expect(mocks.parseSingleSource).not.toHaveBeenCalled();

    mocks.storeState = {
      ...mocks.storeState,
      sources: [{ id: "bad", type: "yaml", content: "proxies: []", parsed: false, error: "bad import" }],
    };
    renderWithState();
    mocks.parseSingleSource.mockResolvedValueOnce(undefined);
    mocks.uiButtons.find((button) => button.title === "导入此源")?.onClick();
    await flushAsyncWork();

    expect(mocks.parseSingleSource).toHaveBeenCalledWith("bad");
    expect(mocks.sourceImported).toHaveBeenCalledWith(
      expect.objectContaining({ result: "runtimeError", sourceType: "yaml", sourceCount: 1 })
    );
  });
});
