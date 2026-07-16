import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCurrentAdmin } from "@local/lib/auth";
import {
  createTemplate,
  deleteTemplate,
  getTemplateDetail,
  listTemplates,
} from "@local/lib/template-service";
import * as itemRoute from "../app/api/templates/[id]/route";
import * as collectionRoute from "../app/api/templates/route";

vi.mock("@local/lib/auth", () => ({
  getCurrentAdmin: vi.fn(),
}));

vi.mock("@local/lib/template-service", () => ({
  createTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  getTemplateDetail: vi.fn(),
  listTemplates: vi.fn(),
}));

const admin = { id: "admin-1", username: "root" };
const template = {
  id: "tpl-1",
  name: "Local",
  description: "Private template",
  downloads: 0,
  engagementCount: 0,
  createdAt: "2026-06-01T00:00:00.000Z",
  tags: ["本地"],
  isOfficial: false,
  isPublic: false,
  proxyGroupCount: 2,
  ruleCount: 3,
};

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentAdmin).mockResolvedValue(admin);
  vi.mocked(listTemplates).mockResolvedValue([template]);
  vi.mocked(getTemplateDetail).mockResolvedValue({ ...template, kind: "config", config: { template: "standard" } } as never);
  vi.mocked(createTemplate).mockResolvedValue(template);
  vi.mocked(deleteTemplate).mockResolvedValue(true);
});

describe("local template routes", () => {
  it("lists local tabs through the shared template contract", async () => {
    const response = await collectionRoute.GET(new Request("http://local.test/api/templates?type=my&ids=tpl-1"));

    expect(response.status).toBe(200);
    expect(listTemplates).toHaveBeenCalledWith("admin-1", "my", ["tpl-1"]);
    await expect(response.json()).resolves.toMatchObject({
      templates: [template],
      pagination: { total: 1, totalPages: 1 },
    });

    const defaultResponse = await collectionRoute.GET(
      new Request("http://local.test/api/templates?ids=tpl-1,,tpl-1,tpl-2")
    );
    expect(defaultResponse.status).toBe(200);
    expect(listTemplates).toHaveBeenLastCalledWith("admin-1", "default", ["tpl-1", "tpl-2"]);
  });

  it("rejects unsupported local template tabs without falling back to default", async () => {
    for (const type of ["unknown", "catalog", "plaza", "official"]) {
      const response = await collectionRoute.GET(new Request(`http://local.test/api/templates?type=${type}`));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: "Invalid template type.",
        code: "VALIDATION_ERROR",
      });
    }
    expect(listTemplates).not.toHaveBeenCalled();
  });

  it("creates and deletes private local templates", async () => {
    const payload = { name: "Local", config: { template: "standard" } };
    const createResponse = await collectionRoute.POST(jsonRequest("http://local.test/api/templates", payload));
    expect(createResponse.status).toBe(201);
    expect(createTemplate).toHaveBeenCalledWith("admin-1", payload);

    const deleteResponse = await collectionRoute.DELETE(new Request("http://local.test/api/templates?id=tpl-1"));
    expect(deleteResponse.status).toBe(200);
    expect(deleteTemplate).toHaveBeenCalledWith("admin-1", "tpl-1");
  });

  it("rejects template bodies above 4 MiB", async () => {
    const response = await collectionRoute.POST(new Request("http://local.test/api/templates", {
      method: "POST",
      headers: { "content-length": String(4 * 1024 * 1024 + 1) },
      body: "{}",
    }));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: "Request body is too large.",
      code: "PAYLOAD_TOO_LARGE",
    });
  });

  it("reports local template collection errors", async () => {
    vi.mocked(listTemplates).mockRejectedValueOnce(new Error("Bad filters"));
    let response = await collectionRoute.GET(new Request("http://local.test/api/templates?type=default"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Bad filters",
      code: "BAD_REQUEST",
    });

    response = await collectionRoute.POST(jsonRequest("http://local.test/api/templates", null));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid JSON body.",
      code: "BAD_REQUEST",
    });

    vi.mocked(createTemplate).mockRejectedValueOnce("bad");
    response = await collectionRoute.POST(jsonRequest("http://local.test/api/templates", { name: "" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unable to create template.",
      code: "BAD_REQUEST",
    });

    response = await collectionRoute.DELETE(new Request("http://local.test/api/templates"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Template ID required.",
      code: "BAD_REQUEST",
    });

    vi.mocked(deleteTemplate).mockResolvedValueOnce(false);
    response = await collectionRoute.DELETE(new Request("http://local.test/api/templates?id=missing"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Template not found.",
      code: "NOT_FOUND",
    });
  });

  it("serves template detail by id", async () => {
    const response = await itemRoute.GET(new Request("http://local.test/api/templates/tpl-1"), {
      params: Promise.resolve({ id: "tpl-1" }),
    });

    expect(response.status).toBe(200);
    expect(getTemplateDetail).toHaveBeenCalledWith("admin-1", "tpl-1");
    await expect(response.json()).resolves.toMatchObject({ template: { id: "tpl-1", kind: "config" } });
  });

  it("reports missing and failed template detail reads for admins", async () => {
    vi.mocked(getTemplateDetail).mockResolvedValueOnce(null);
    let response = await itemRoute.GET(new Request("http://local.test/api/templates/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Template not found.",
      code: "NOT_FOUND",
    });

    vi.mocked(getTemplateDetail).mockRejectedValueOnce("bad");
    response = await itemRoute.GET(new Request("http://local.test/api/templates/bad"), {
      params: Promise.resolve({ id: "bad" }),
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Unable to load template.",
      code: "BAD_REQUEST",
    });
  });

  it("rejects unauthenticated template writes before service calls", async () => {
    vi.mocked(getCurrentAdmin).mockResolvedValue(null);

    const createResponse = await collectionRoute.POST(
      jsonRequest("http://local.test/api/templates", { name: "Local", config: { template: "standard" } })
    );
    const deleteResponse = await collectionRoute.DELETE(new Request("http://local.test/api/templates?id=tpl-1"));

    for (const response of [createResponse, deleteResponse]) {
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: "Authentication required.",
        code: "UNAUTHORIZED",
      });
    }

    expect(createTemplate).not.toHaveBeenCalled();
    expect(deleteTemplate).not.toHaveBeenCalled();
  });

  it("keeps optional template reads but returns auth errors when private reads reject unauthenticated access", async () => {
    vi.mocked(getCurrentAdmin).mockResolvedValue(null);
    vi.mocked(listTemplates).mockRejectedValueOnce(new Error("Private templates require auth"));
    vi.mocked(getTemplateDetail).mockRejectedValueOnce(new Error("Private template requires auth"));

    const listResponse = await collectionRoute.GET(new Request("http://local.test/api/templates?type=my"));
    const detailResponse = await itemRoute.GET(new Request("http://local.test/api/templates/tpl-1"), {
      params: Promise.resolve({ id: "tpl-1" }),
    });

    for (const response of [listResponse, detailResponse]) {
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: "Authentication required.",
        code: "UNAUTHORIZED",
      });
    }
  });
});
