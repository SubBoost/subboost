import { withAccountAdmin } from "@local/lib/api-auth";
import { LOCAL_ACCOUNT_MANAGEMENT_MESSAGES } from "@local/lib/admin-credentials";
import { apiError, json } from "@local/lib/http";
import { prisma } from "@local/lib/prisma";
import { normalizeLocalAdminRole } from "@local/lib/auth";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  return withAccountAdmin(async (admin) => {
    const { id } = await context.params;
    const account = await prisma.localAdmin.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!account) {
      return apiError(LOCAL_ACCOUNT_MANAGEMENT_MESSAGES.userNotFound, "NOT_FOUND", 404);
    }
    if (account.id === admin.id) {
      return apiError(LOCAL_ACCOUNT_MANAGEMENT_MESSAGES.cannotDeleteSelf, "FORBIDDEN", 403);
    }
    if (normalizeLocalAdminRole(account.role) === "ADMIN") {
      return apiError(LOCAL_ACCOUNT_MANAGEMENT_MESSAGES.cannotDeleteAdmin, "FORBIDDEN", 403);
    }

    // Subscriptions and templates owned by the account are removed with it
    // through the cascade deletes defined in the Prisma schema.
    await prisma.localAdmin.delete({ where: { id: account.id } });
    return json({ success: true });
  });
}
