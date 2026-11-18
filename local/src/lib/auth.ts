import { prisma } from "./prisma";
import { readSession } from "./session";

export type LocalAdminRole = "ADMIN" | "USER";

export type CurrentAdmin = {
  id: string;
  username: string;
  role: LocalAdminRole;
  isAdmin: boolean;
};

export function normalizeLocalAdminRole(value: unknown): LocalAdminRole {
  return value === "ADMIN" ? "ADMIN" : "USER";
}

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const session = await readSession();
  if (!session) return null;
  const admin = await prisma.localAdmin.findUnique({
    where: { id: session.adminId },
    select: { id: true, username: true, role: true },
  });
  if (!admin) return null;
  const role = normalizeLocalAdminRole(admin.role);
  return { id: admin.id, username: admin.username, role, isAdmin: role === "ADMIN" };
}

export async function isSetupRequired(): Promise<boolean> {
  const count = await prisma.localAdmin.count();
  return count === 0;
}
