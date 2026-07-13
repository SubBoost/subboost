import { apiError } from "@local/lib/http";
import { generateSubscriptionYaml } from "@local/lib/subscription-service";
import { buildSubscriptionResponseHeaders } from "@subboost/server-core/subscription";
import {
  consumeLocalRateLimit,
  hashLocalRateLimitKey,
  localRateLimitResponse,
} from "@local/lib/rate-limit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { id: token } = await params;
  const globalLimit = consumeLocalRateLimit("subscription-yaml-global", "all", {
    limit: 600,
    windowMs: 60_000,
  });
  if (!globalLimit.allowed) {
    return localRateLimitResponse("Too many subscription requests. Try again later.", globalLimit.retryAfterSeconds);
  }
  const tokenLimit = consumeLocalRateLimit("subscription-yaml-token", hashLocalRateLimitKey(token), {
    limit: 120,
    windowMs: 60_000,
  });
  if (!tokenLimit.allowed) {
    return localRateLimitResponse("Too many subscription requests. Try again later.", tokenLimit.retryAfterSeconds);
  }
  const result = await generateSubscriptionYaml(token);
  if (!result) return apiError("Subscription YAML not found.", "NOT_FOUND", 404);
  return new Response(result.yaml, {
    headers: buildSubscriptionResponseHeaders(result.name, result.subscriptionInfo, {
      cacheControl: "no-store",
      cacheExpirySeconds: result.cacheExpirySeconds,
      autoUpdateIntervalSeconds: result.autoUpdateIntervalSeconds,
      isAdmin: result.isAdmin,
    }),
  });
}
