import { handleRuleDetection } from "@subboost/server-core/rules/detect";
import { withCurrentAdmin } from "@local/lib/api-auth";
import { consumeLocalRateLimit, localRateLimitResponse } from "@local/lib/rate-limit";
import { fetchRuleContentDirect } from "@local/lib/source-import";

export async function POST(request: Request) {
  return withCurrentAdmin(async (admin) => {
    const rate = consumeLocalRateLimit("rule-detection", admin.id, { limit: 30, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) return localRateLimitResponse("规则识别过于频繁，请稍后重试", rate.retryAfterSeconds);
    return handleRuleDetection(request, async (url) => {
      const result = await fetchRuleContentDirect(url);
      return result.ok ? result.content ?? null : null;
    });
  });
}
