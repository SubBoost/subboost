import { withCurrentAdmin } from "@local/lib/api-auth";
import { apiError, json, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";
import { importSourceUrlDirect } from "@local/lib/source-import";
import { buildSourceImportParseResult } from "@subboost/server-core/subscription";

function getStringField(body: unknown, key: string): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  return withCurrentAdmin(async () => {
    const parsedBody = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
    if (!parsedBody.ok) return jsonBodyError(parsedBody);
    const body = parsedBody.value;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return apiError("Invalid JSON body.", "BAD_REQUEST", 400);
    }

    const result = await importSourceUrlDirect({
      url: getStringField(body, "url"),
      userinfoUrl: getStringField(body, "userinfoUrl") || undefined,
      userinfoUserAgent: getStringField(body, "userinfoUserAgent") || undefined,
    });

    if (!result.ok) {
      return json(
        {
          error: result.error,
          code: result.errorInfo.category === "format" ? "BAD_REQUEST" : "INTERNAL_ERROR",
          errorInfo: result.errorInfo,
        },
        result.responseStatus && result.responseStatus >= 400 ? result.responseStatus : 400
      );
    }

    return json({
      content: result.content,
      headers: result.headers,
      parseResult: buildSourceImportParseResult(result),
    });
  });
}
