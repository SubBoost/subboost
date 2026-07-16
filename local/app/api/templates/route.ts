import { getOptionalCurrentAdmin, localAdminRequiredResponse, withCurrentAdmin } from "@local/lib/api-auth";
import { apiError, json, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
} from "@local/lib/template-service";
import { parseCurrentTemplateTab } from "@subboost/server-core/templates";

function parseIds(value: string | null): string[] {
  if (!value) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value.split(",")) {
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export async function GET(request: Request) {
  const admin = await getOptionalCurrentAdmin();
  const { searchParams } = new URL(request.url);
  const parsedTab = parseCurrentTemplateTab(searchParams.get("type"), {
    supportedTabs: ["default", "my"],
    defaultTab: "default",
  });
  if (!parsedTab.ok) {
    return apiError("Invalid template type.", "VALIDATION_ERROR", 400);
  }
  const tab = parsedTab.tab;

  try {
    const templates = await listTemplates(admin?.id ?? null, tab, parseIds(searchParams.get("ids")));
    return json({
      templates,
      pagination: {
        page: 1,
        limit: templates.length,
        total: templates.length,
        totalPages: 1,
      },
    });
  } catch (error) {
    if (!admin) return localAdminRequiredResponse();
    return apiError(error instanceof Error ? error.message : "Unable to list templates.", "BAD_REQUEST", 400);
  }
}

export async function POST(request: Request) {
  return withCurrentAdmin(async (admin) => {
    const parsedBody = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.template);
    if (!parsedBody.ok) return jsonBodyError(parsedBody);
    if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
      return apiError("Invalid JSON body.", "BAD_REQUEST", 400);
    }

    try {
      const template = await createTemplate(admin.id, parsedBody.value);
      return json({ template }, 201);
    } catch (error) {
      return apiError(error instanceof Error ? error.message : "Unable to create template.", "BAD_REQUEST", 400);
    }
  });
}

export async function DELETE(request: Request) {
  return withCurrentAdmin(async (admin) => {
    const id = new URL(request.url).searchParams.get("id")?.trim() || "";
    if (!id) return apiError("Template ID required.", "BAD_REQUEST", 400);

    const deleted = await deleteTemplate(admin.id, id);
    if (!deleted) return apiError("Template not found.", "NOT_FOUND", 404);
    return json({ success: true });
  });
}
