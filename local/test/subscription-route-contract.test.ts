import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentAdmin } from "@local/lib/auth";
import {
  createSubscription,
  deleteSubscription,
  generateSubscriptionYaml,
  getSubscription,
  listSubscriptions,
  refreshSubscription,
  updateSubscription,
} from "@local/lib/subscription-service";

import * as pluralYamlRoute from "../app/api/subscriptions/[id]/config.yaml/route";
import * as pluralItemRoute from "../app/api/subscriptions/[id]/route";
import * as pluralCollectionRoute from "../app/api/subscriptions/route";
import * as pluralRefreshRoute from "../app/api/subscriptions/[id]/refresh/route";

vi.mock("@local/lib/auth", () => ({
  getCurrentAdmin: vi.fn(),
}));

vi.mock("@local/lib/subscription-service", () => ({
  createSubscription: vi.fn(),
  deleteSubscription: vi.fn(),
  generateSubscriptionYaml: vi.fn(),
  getSubscription: vi.fn(),
  listSubscriptions: vi.fn(),
  refreshSubscription: vi.fn(),
  updateSubscription: vi.fn(),
}));

const admin = { id: "admin-1", username: "root" };
const subscription = {
  id: "sub-1",
  name: "Main",
  token: "token-1",
};
const fullConfigPayload = {
  name: "Main",
  urls: ["https://example.com/sub.yaml"],
  nodes: [
    {
      name: "node-a",
      type: "trojan",
      server: "example.com",
      port: 443,
      password: "secret",
    },
  ],
  subscriptionInfo: { total: 1024, download: 128, upload: 64 },
  autoUpdateInterval: 86400,
  config: {
    template: "full",
    sources: [{ id: "src-1", type: "url", content: "https://example.com/sub.yaml" }],
    enabledGroups: ["PROXY"],
    hiddenProxyGroups: ["DIRECT"],
    customProxyGroups: [{ id: "group-1", name: "Custom", type: "select", proxies: ["node-a"] }],
    customRules: [{ id: "rule-1", type: "DOMAIN-SUFFIX", value: "example.com", target: "PROXY" }],
    ruleOrder: ["rule-1"],
    allRulesOrderEditingEnabled: true,
    dialerProxyGroups: [{ proxyName: "node-a", dialerProxy: "relay-a" }],
    proxyGroupNameOverrides: { PROXY: "Proxy" },
    listenerPorts: { "node-a": 12000 },
    dnsYaml: "dns:\n  enable: true",
    ruleProviderBaseUrl: "https://rules.example.com",
    testUrl: "https://cp.cloudflare.com/generate_204",
    testInterval: 300,
    cnIpNoResolve: true,
    experimentalCnUseCnRuleSet: true,
    deletedNodeNames: ["old-node"],
    deletedNodes: [{ originName: "old-node", name: "old-node" }],
    smartNodeMatchingEnabled: true,
  },
};

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentAdmin).mockResolvedValue(admin);
  vi.mocked(createSubscription).mockResolvedValue(subscription as never);
  vi.mocked(deleteSubscription).mockResolvedValue(true);
  vi.mocked(generateSubscriptionYaml).mockResolvedValue("mixed-port: 7890\n");
  vi.mocked(getSubscription).mockResolvedValue(subscription as never);
  vi.mocked(listSubscriptions).mockResolvedValue([subscription] as never);
  vi.mocked(refreshSubscription).mockResolvedValue({
    ok: true,
    body: { subscriptionId: "sub-1", nodeCount: 1 },
  } as never);
  vi.mocked(updateSubscription).mockResolvedValue({ ...subscription, name: "Renamed" } as never);
});

describe("local subscription routes", () => {
  it("uses plural collection routes as the public subscription contract", async () => {
    const listResponse = await pluralCollectionRoute.GET();
    expect(listResponse.status).toBe(200);
    expect(await readJson(listResponse)).toEqual({ subscriptions: [subscription] });
    expect(listSubscriptions).toHaveBeenCalledWith("admin-1");

    const createResponse = await pluralCollectionRoute.POST(jsonRequest("http://local.test/api/subscriptions", fullConfigPayload));
    expect(createResponse.status).toBe(201);
    expect(await readJson(createResponse)).toEqual({ subscription });
    expect(createSubscription).toHaveBeenCalledWith("admin-1", fullConfigPayload);
  });

  it("uses plural item and refresh routes with path ids", async () => {
    const params = { params: Promise.resolve({ id: "sub-1" }) };

    const getResponse = await pluralItemRoute.GET(new Request("http://local.test/api/subscriptions/sub-1"), params);
    expect(getResponse.status).toBe(200);
    expect(getSubscription).toHaveBeenCalledWith("admin-1", "sub-1");

    const updateResponse = await pluralItemRoute.PUT(
      jsonRequest("http://local.test/api/subscriptions/sub-1", { ...fullConfigPayload, name: "Renamed" }),
      params
    );
    expect(updateResponse.status).toBe(200);
    expect(updateSubscription).toHaveBeenCalledWith("admin-1", "sub-1", { ...fullConfigPayload, name: "Renamed" });

    const refreshResponse = await pluralRefreshRoute.POST(new Request("http://local.test/api/subscriptions/sub-1/refresh"), params);
    expect(refreshResponse.status).toBe(200);
    expect(refreshSubscription).toHaveBeenCalledWith("admin-1", "sub-1");
  });

  it("serves YAML through the plural token route only", async () => {
    const pluralResponse = await pluralYamlRoute.GET(new Request("http://local.test/api/subscriptions/token-1/config.yaml"), {
      params: Promise.resolve({ id: "token-1" }),
    });
    expect(pluralResponse.status).toBe(200);
    expect(pluralResponse.headers.get("content-disposition")).toBe('attachment; filename="subboost-config.yaml"');
    expect(await pluralResponse.text()).toBe("mixed-port: 7890\n");
    expect(generateSubscriptionYaml).toHaveBeenCalledWith("token-1");
  });

  it("rejects unauthenticated protected subscription routes before service calls", async () => {
    vi.mocked(getCurrentAdmin).mockResolvedValue(null);
    const params = { params: Promise.resolve({ id: "sub-1" }) };

    const listResponse = await pluralCollectionRoute.GET();
    const createResponse = await pluralCollectionRoute.POST(jsonRequest("http://local.test/api/subscriptions", fullConfigPayload));
    const getResponse = await pluralItemRoute.GET(new Request("http://local.test/api/subscriptions/sub-1"), params);
    const updateResponse = await pluralItemRoute.PUT(
      jsonRequest("http://local.test/api/subscriptions/sub-1", { ...fullConfigPayload, name: "Renamed" }),
      params
    );
    const deleteResponse = await pluralItemRoute.DELETE(new Request("http://local.test/api/subscriptions/sub-1"), params);
    const refreshResponse = await pluralRefreshRoute.POST(new Request("http://local.test/api/subscriptions/sub-1/refresh"), params);

    for (const response of [listResponse, createResponse, getResponse, updateResponse, deleteResponse, refreshResponse]) {
      expect(response.status).toBe(401);
      await expect(readJson(response)).resolves.toEqual({
        error: "Authentication required.",
        code: "UNAUTHORIZED",
      });
    }

    expect(listSubscriptions).not.toHaveBeenCalled();
    expect(createSubscription).not.toHaveBeenCalled();
    expect(getSubscription).not.toHaveBeenCalled();
    expect(updateSubscription).not.toHaveBeenCalled();
    expect(deleteSubscription).not.toHaveBeenCalled();
    expect(refreshSubscription).not.toHaveBeenCalled();
  });
});
