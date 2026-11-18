import { withAccountAdmin, withCurrentAdmin } from "@local/lib/api-auth";
import { apiError, json, jsonBodyError, LOCAL_JSON_BODY_LIMITS, readJsonBody } from "@local/lib/http";
import { prisma } from "@local/lib/prisma";
import { getAllowUnsafeSubscriptionSources } from "@local/lib/source-import-settings";

export async function GET() {
  // The switch is an instance-wide setting owned by the administrator, so
  // every account reads the same effective value — the one imports actually
  // enforce — instead of its own row's default.
  return withCurrentAdmin(async () => {
    return json({ allowUnsafeSubscriptionSources: await getAllowUnsafeSubscriptionSources() });
  });
}

export async function PATCH(request: Request) {
  // The switch guards the whole instance against SSRF through local and LAN
  // subscription sources, so only the administrator may change it.
  return withAccountAdmin(async (admin) => {
    const parsedBody = await readJsonBody(request, LOCAL_JSON_BODY_LIMITS.small);
    if (!parsedBody.ok) return jsonBodyError(parsedBody);
    const body = parsedBody.value;

    const allowUnsafeSubscriptionSources =
      typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>).allowUnsafeSubscriptionSources
        : undefined;
    if (typeof allowUnsafeSubscriptionSources !== "boolean") {
      return apiError("allowUnsafeSubscriptionSources must be a boolean.", "VALIDATION_ERROR", 400);
    }

    const settings = await prisma.localAdmin.update({
      where: { id: admin.id },
      data: { allowUnsafeSubscriptionSources },
      select: { allowUnsafeSubscriptionSources: true },
    });

    return json(settings);
  });
}
