import { prisma } from "./prisma";
import { readSession } from "./session";
import { isSetupRequired as readSetupRequired } from "./local-user-service";

export type CurrentAdmin = {
  id: string;
  username: string;
};

export async function getCurrentAdmin(): Promise<CurrentAdmin | null> {
  const session = await readSession();
  if (!session) return null;
  return prisma.localAdmin.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true },
  });
}

export async function isSetupRequired(): Promise<boolean> {
  return readSetupRequired();
}
