import { withCurrentAdmin } from "@local/lib/api-auth";
import { apiError, json, readJsonBody } from "@local/lib/http";
import { prisma } from "@local/lib/prisma";

export async function GET() {
  return withCurrentAdmin(async (admin) => {
    const settings = await prisma.localAdmin.findUnique({
      where: { id: admin.id },
      select: { allowUnsafeSubscriptionSources: true },
    });

    if (!settings) return apiError("Local admin not found.", "NOT_FOUND", 404);
    return json(settings);
  });
}

export async function PATCH(request: Request) {
  return withCurrentAdmin(async (admin) => {
    const body = await readJsonBody(request);
    if (!body) return apiError("Invalid JSON body.", "BAD_REQUEST", 400);

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
