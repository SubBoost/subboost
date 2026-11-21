import { getCurrentAdmin } from "@local/lib/auth";
import { getAppUrl } from "@local/lib/env";
import { apiError, json } from "@local/lib/http";
import { getWebUpdateStatus, queueWebUpdate } from "@local/lib/web-update";

export async function GET() {
  if (!(await getCurrentAdmin())) return apiError("Login required.", "UNAUTHORIZED", 401);

  const response = json({ status: await getWebUpdateStatus() });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  if (!(await getCurrentAdmin())) return apiError("Login required.", "UNAUTHORIZED", 401);
  if (request.headers.get("origin") !== new URL(getAppUrl()).origin) {
    return apiError("Origin must match APP_URL.", "FORBIDDEN", 403);
  }
  const result = await queueWebUpdate();
  if (result === "disabled") return apiError("Web updates are disabled.", "NOT_FOUND", 404);
  if (result === "busy") return apiError("An update is already queued or running.", "CONFLICT", 409);
  return json({ status: result }, 202);
}
