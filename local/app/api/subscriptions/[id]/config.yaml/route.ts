import { apiError } from "@local/lib/http";
import { generateSubscriptionYaml } from "@local/lib/subscription-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { id: token } = await params;
  const yaml = await generateSubscriptionYaml(token);
  if (!yaml) return apiError("Subscription YAML not found.", "NOT_FOUND", 404);
  return new Response(yaml, {
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="subboost-config.yaml"',
      "Cache-Control": "no-store",
    },
  });
}
