import { withCurrentAdmin, withCurrentAdminAndCsrf } from "@local/lib/api-auth";
import { apiError, json, readJsonBody } from "@local/lib/http";
import { listLocalUsers, updateLocalUserAccount } from "@local/lib/local-user-service";

export async function GET() {
  return withCurrentAdmin(async (admin) => {
    const users = await listLocalUsers();
    const current = users.find((item) => item.id === admin.id);
    if (!current) return apiError("User not found.", "NOT_FOUND", 404);
    return json({ user: current });
  });
}

export async function PUT(request: Request) {
  return withCurrentAdminAndCsrf(request, async (admin) => {
    const body = await readJsonBody(request);
    if (!body) return apiError("Invalid JSON body.", "BAD_REQUEST", 400);

    try {
      const user = await updateLocalUserAccount(admin.id, body);
      return json({ user });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update user.";
      const status = message.includes("Unique constraint") ? 409 : 400;
      const code = status === 409 ? "CONFLICT" : "BAD_REQUEST";
      return apiError(message, code, status);
    }
  });
}
