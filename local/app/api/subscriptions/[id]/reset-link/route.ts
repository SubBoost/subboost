import { withCurrentAdmin } from "@local/lib/api-auth";
import { apiError, json } from "@local/lib/http";
import { resetSubscriptionLink } from "@local/lib/subscription-service";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withCurrentAdmin(async (admin) => {
    const { id } = await params;
    const expectedToken = /^"([A-Za-z0-9_-]{43})"$/.exec(request.headers.get("if-match") ?? "")?.[1];
    if (!id || id.length > 128 || !expectedToken) {
      return apiError("请刷新页面后重试", "BAD_REQUEST", 400);
    }
    const result = await resetSubscriptionLink(admin.id, id, expectedToken);
    if (result.status === "not_found") return apiError("订阅不存在", "NOT_FOUND", 404);
    if (result.status === "stale") return apiError("订阅链接已更改，请刷新页面后重试", "CONFLICT", 409);
    const response = json({ subscription: result.subscription });
    response.headers.set("Cache-Control", "no-store");
    return response;
  });
}
