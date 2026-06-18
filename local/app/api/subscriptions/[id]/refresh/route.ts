import { refreshSubscriptionResponse } from "@local/lib/subscription-route-handlers";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  return refreshSubscriptionResponse(request, id);
}
