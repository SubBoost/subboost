import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const ruleService = {
    searchRules: vi.fn(),
    refreshRuleIndex: vi.fn(),
    getCnRuleCandidateDiscovery: vi.fn(),
  };
  let ruleCatalogOptions:
    | {
        getGitHubToken: () => string;
        logger: typeof console;
      }
    | undefined;

  return {
    prisma: {
      localAdmin: {
        findUnique: vi.fn(),
        count: vi.fn(),
      },
    },
    readSession: vi.fn(),
    encryptEncryptedFieldV2: vi.fn(),
    decryptEncryptedFieldV2: vi.fn(),
    createRuleCatalogService: vi.fn(
      (options: {
        getGitHubToken: () => string;
        logger: typeof console;
      }) => {
        ruleCatalogOptions = options;
        return ruleService;
      },
    ),
    getRuleCatalogOptions: () => ruleCatalogOptions,
    ruleService,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("./prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./session", () => ({ readSession: mocks.readSession }));
vi.mock("@subboost/server-core/crypto", () => ({
  encryptEncryptedFieldV2: mocks.encryptEncryptedFieldV2,
  decryptEncryptedFieldV2: mocks.decryptEncryptedFieldV2,
}));
vi.mock("@subboost/server-core/rules", () => ({
  createRuleCatalogService: mocks.createRuleCatalogService,
}));

import { getCurrentAdmin, isSetupRequired } from "./auth";
import { decryptJson, decryptJsonObject, decryptText, encryptJson, encryptText } from "./crypto";
import { getAppUrl, isHttpsAppUrl, requireEnv } from "./env";
import { apiError, getStringField, json, readJsonBody } from "./http";
import {
  getCnRuleCandidateDiscovery,
  localRuleCatalogService,
  refreshRuleIndex,
  searchRules,
} from "./rule-catalog";

const originalEnv = {
  APP_URL: process.env.APP_URL,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function readResponse(response: Response) {
  return { status: response.status, body: await response.json() };
}

describe("local lib helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    restoreEnv();
    process.env.APP_URL = " https://local.subboost.test/// ";
    process.env.ENCRYPTION_KEY = " master-key ";
    process.env.GITHUB_TOKEN = "gh-token";
    mocks.encryptEncryptedFieldV2.mockImplementation((plaintext: string, key: string) => `enc:${key}:${plaintext}`);
    mocks.decryptEncryptedFieldV2.mockImplementation((ciphertext: string, key: string) => {
      if (ciphertext === "json") return JSON.stringify({ ok: true });
      if (ciphertext === "array") return JSON.stringify(["nope"]);
      return `dec:${key}:${ciphertext}`;
    });
  });

  afterEach(() => {
    restoreEnv();
  });

  it("reads required local environment values and normalizes APP_URL", () => {
    expect(requireEnv("ENCRYPTION_KEY")).toBe("master-key");
    expect(getAppUrl()).toBe("https://local.subboost.test");
    expect(isHttpsAppUrl()).toBe(true);

    process.env.APP_URL = "http://127.0.0.1:3001/";
    expect(getAppUrl()).toBe("http://127.0.0.1:3001");
    expect(isHttpsAppUrl()).toBe(false);

    delete process.env.APP_URL;
    expect(() => requireEnv("APP_URL")).toThrow("APP_URL is required");
  });

  it("loads current admin and setup state from the local session", async () => {
    mocks.readSession.mockResolvedValueOnce(null);
    await expect(getCurrentAdmin()).resolves.toBeNull();

    mocks.readSession.mockResolvedValueOnce({ sessionId: "sess-1", userId: "admin-1", username: "root" });
    mocks.prisma.localAdmin.findUnique.mockResolvedValueOnce({ id: "admin-1", username: "root" });
    await expect(getCurrentAdmin()).resolves.toEqual({ id: "admin-1", username: "root" });
    expect(mocks.prisma.localAdmin.findUnique).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      select: { id: true, username: true },
    });

    mocks.prisma.localAdmin.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await expect(isSetupRequired()).resolves.toBe(true);
    await expect(isSetupRequired()).resolves.toBe(false);
  });

  it("encrypts and decrypts text and JSON through the shared crypto helpers", () => {
    expect(encryptText("hello")).toBe("enc:master-key:hello");
    expect(decryptText("cipher")).toBe("dec:master-key:cipher");
    expect(encryptJson({ ok: true })).toBe('enc:master-key:{"ok":true}');
    expect(decryptJson("json", { ok: false })).toEqual({ ok: true });
    expect(decryptJson(null, { fallback: true })).toEqual({ fallback: true });
    expect(decryptJsonObject("json")).toEqual({ ok: true });
    expect(decryptJsonObject("array")).toEqual({});
  });

  it("builds JSON responses and reads request bodies safely", async () => {
    await expect(readResponse(json({ ok: true }, 201))).resolves.toEqual({ status: 201, body: { ok: true } });
    await expect(readResponse(apiError("bad", "BAD_REQUEST", 400))).resolves.toEqual({
      status: 400,
      body: { error: "bad", code: "BAD_REQUEST" },
    });
    await expect(readJsonBody(new Request("https://local.test", { method: "POST", body: "" }))).resolves.toEqual({});
    await expect(readJsonBody(new Request("https://local.test", { method: "POST", body: "{bad" }))).resolves.toBeNull();
    await expect(readJsonBody(new Request("https://local.test", { method: "POST", body: '{"name":" Ry "}' }))).resolves.toEqual({ name: " Ry " });
    expect(getStringField({ name: " Ry " }, "name")).toBe("Ry");
    expect(getStringField({ name: 1 }, "name")).toBe("");
    expect(getStringField(null, "name")).toBe("");
    expect(getStringField([], "name")).toBe("");
  });

  it("exports the local rule catalog service methods", () => {
    expect(localRuleCatalogService).toBe(mocks.ruleService);
    expect(searchRules).toBe(mocks.ruleService.searchRules);
    expect(refreshRuleIndex).toBe(mocks.ruleService.refreshRuleIndex);
    expect(getCnRuleCandidateDiscovery).toBe(mocks.ruleService.getCnRuleCandidateDiscovery);
    const options = mocks.getRuleCatalogOptions();
    if (!options) throw new Error("Expected local rule catalog options to be captured.");
    expect(options.getGitHubToken()).toBe("gh-token");
    expect(options.logger).toBe(console);
  });
});
