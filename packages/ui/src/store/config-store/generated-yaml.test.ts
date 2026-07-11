import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialState } from "./definitions";
import { computeGeneratedYaml, computeGeneratedYamlResult } from "./generated-yaml";

const mocks = vi.hoisted(() => ({
  generateClashYaml: vi.fn(),
  stripImportedNodeControlFieldsFromList: vi.fn(),
}));

vi.mock("@subboost/core/generator", () => ({
  generateClashYaml: mocks.generateClashYaml,
}));

vi.mock("@subboost/core/subscription/imported-node-controls", () => ({
  stripImportedNodeControlFieldsFromList: mocks.stripImportedNodeControlFieldsFromList,
}));

function createState(overrides: Record<string, unknown> = {}) {
  return {
    ...structuredClone(initialState),
    ...overrides,
  } as any;
}

describe("computeGeneratedYamlResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateClashYaml.mockReturnValue("generated yaml");
    mocks.stripImportedNodeControlFieldsFromList.mockImplementation((nodes) => nodes);
  });

  it("passes sanitized nodes and valid proxy providers to the core generator", () => {
    const nodes = [{ name: "Node A", type: "ss", _sourceIds: ["source-1"] }];
    const result = computeGeneratedYamlResult(
      createState({
        nodes,
        sources: [
          {
            id: "source-1",
            type: "url",
            content: " https://example.com/sub.yaml ",
            useProxyProviders: true,
          },
          {
            id: "source-2",
            type: "url",
            content: "ftp://example.com/sub.yaml",
            useProxyProviders: true,
          },
          {
            id: "source-3",
            type: "yaml",
            content: "proxies: []",
            useProxyProviders: true,
          },
        ],
        testUrl: "https://cp.cloudflare.com/generate_204",
        testInterval: 600,
        urlTestLazy: true,
        urlTestTolerance: 50,
        enabledProxyGroups: ["select", "ai"],
        ruleOrder: ["module:ai"],
      })
    );

    expect(result).toEqual({ yaml: "generated yaml", error: null });
    expect(mocks.stripImportedNodeControlFieldsFromList).toHaveBeenCalledWith(nodes);
    expect(mocks.generateClashYaml).toHaveBeenCalledWith(
      expect.objectContaining({
        nodes,
        proxyProviders: {
          "url_source-1": {
            type: "http",
            url: "https://example.com/sub.yaml",
            interval: 3600,
            path: "./proxy_providers/url_source-1.yaml",
            "health-check": {
              enable: true,
              url: "https://cp.cloudflare.com/generate_204",
              interval: 600,
            },
          },
        },
        userConfig: expect.objectContaining({
          enabledGroups: ["select", "ai"],
          enabledRules: ["select", "ai"],
          ruleOrder: ["module:ai"],
          autoSelectStrategy: "url-test",
          urlTestLazy: true,
          urlTestTolerance: 50,
        }),
      })
    );
  });

  it("hides generated preview output when there are no nodes or providers", () => {
    const result = computeGeneratedYamlResult(createState());

    expect(result).toEqual({ yaml: "", error: null });
    expect(mocks.generateClashYaml).toHaveBeenCalled();
  });

  it("keeps provider-only preview content visible", () => {
    const yaml = computeGeneratedYaml(
      createState({
        sources: [
          {
            id: "remote",
            type: "url",
            content: "https://example.com/sub.yaml",
            useProxyProviders: true,
          },
        ],
      })
    );

    expect(yaml).toBe("generated yaml");
  });

  it("formats generator failures for UI display", () => {
    mocks.generateClashYaml.mockImplementationOnce(() => {
      throw new Error("dns yaml failed");
    });
    expect(computeGeneratedYamlResult(createState({ nodes: [{ name: "Node A" }] }))).toEqual({
      yaml: "",
      error: "dns yaml failed",
    });

    mocks.generateClashYaml.mockImplementationOnce(() => {
      throw "bad";
    });
    expect(computeGeneratedYamlResult(createState({ nodes: [{ name: "Node A" }] }))).toEqual({
      yaml: "",
      error: "生成配置失败",
    });
  });
});
