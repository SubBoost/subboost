import { prisma } from "@local/lib/prisma";

export async function getAllowUnsafeSubscriptionSources(): Promise<boolean> {
  const admin = await prisma.localAdmin.findFirst({
    select: { allowUnsafeSubscriptionSources: true },
  });

  return admin?.allowUnsafeSubscriptionSources ?? false;
}
