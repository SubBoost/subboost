import { ensureLanAdmin, isLanMode } from "./lan-mode";
import { prisma } from "./prisma";
import { readSession } from "./session";

export type CurrentAdmin = {
  id: string;
  username: string;
};

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  // 局域网模式：所有访客统一使用同一个默认管理员，忽略任何已有 session，保证行为一致。
  if (isLanMode()) return ensureLanAdmin();

  const session = await readSession();
  if (!session) return null;
  const admin = await prisma.localAdmin.findUnique({
    where: { id: session.adminId },
    select: { id: true, username: true },
  });
  return admin;
}

export async function isSetupRequired(): Promise<boolean> {
  // 局域网模式下默认管理员由系统自动创建，无需引导用户创建账号。
  if (isLanMode()) return false;
  const count = await prisma.localAdmin.count();
  return count === 0;
}
