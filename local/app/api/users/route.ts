import { withCurrentAdmin, withCurrentAdminAndCsrf } from "@local/lib/api-auth";
import { apiError, json, readJsonBody } from "@local/lib/http";
import { createLocalUser, listLocalUsers } from "@local/lib/local-user-service";

export async function GET() {
  return withCurrentAdmin(async () => json({ users: await listLocalUsers() }));
}

export async function POST(request: Request) {
  return withCurrentAdminAndCsrf(request, async () => {
    const body = await readJsonBody(request);
    if (!body) return apiError("Invalid JSON body.", "BAD_REQUEST", 400);

    try {
      const user = await createLocalUser(body);
      return json({ user }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create user.";
      const status = message.includes("Unique constraint") ? 409 : 400;
      const code = status === 409 ? "CONFLICT" : "BAD_REQUEST";
      return apiError(message, code, status);
    }
  });
}
