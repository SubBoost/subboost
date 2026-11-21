import { getCurrentAdmin, isSetupRequired } from "@local/lib/auth";
import { json } from "@local/lib/http";
import { prisma } from "@local/lib/prisma";

export async function GET() {
  const [setupRequired, admin] = await Promise.all([isSetupRequired(), getCurrentAdmin()]);
  const [subscriptionCount, templateCount] = admin
    ? await Promise.all([
        prisma.subscription.count({ where: { ownerId: admin.id } }),
        prisma.localTemplate.count({ where: { ownerId: admin.id } }),
      ])
    : [0, 0];
  const now = new Date().toISOString();
  return json({
    setupRequired,
    authenticated: Boolean(admin),
    user: admin
      ? {
          id: admin.id,
          username: admin.username,
          name: admin.username,
          avatarUrl: null,
          trustLevel: 4,
          aiAssistantEnabled: false,
          isAdmin: admin.isAdmin,
          isBanned: false,
          active: true,
          silenced: false,
          saveRequirementSatisfied: true,
          saveRequirementSatisfiedAt: now,
          createdAt: now,
          updatedAt: now,
          accounts: [],
          quota: {
            maxSubscriptions: 9999,
            maxNodesPerSubscription: 10000,
            maxCustomTemplates: 9999,
            maxImportSourcesPerType: 9999,
            canUseSubscriptionLink: true,
          },
          subscriptionCount,
          templateCount,
        }
      : null,
  });
}
