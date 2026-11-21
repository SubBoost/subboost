import { prisma } from "./prisma";

export async function getAllowUnsafeSubscriptionSources(): Promise<boolean> {
  // The unsafe-source switch is an instance-level SSRF guard, so it is read
  // from the administrator account rather than from whichever account
  // happens to be listed first now that an instance can have many accounts.
  const admin = await prisma.localAdmin.findFirst({
    where: { role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { allowUnsafeSubscriptionSources: true },
  });

  return admin?.allowUnsafeSubscriptionSources ?? false;
}
