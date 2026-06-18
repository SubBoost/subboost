import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const MIN_PASSWORD_LENGTH = 12;

export type LocalUserSummary = {
  id: string;
  username: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  subscriptionCount: number;
  templateCount: number;
};

function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePassword(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function validateUsername(username: string): string | null {
  if (!username) return "用户名不能为空。";
  if (username.length < 3 || username.length > 32) return "用户名长度需在 3 到 32 个字符之间。";
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) return "用户名只能包含字母、数字、点、下划线和横线。";
  return null;
}

function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `密码长度至少为 ${MIN_PASSWORD_LENGTH} 位。`;
  return null;
}

function formatUserSummary(row: {
  id: string;
  username: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  _count: { subscriptions: number; templates: number };
}): LocalUserSummary {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    subscriptionCount: row._count.subscriptions,
    templateCount: row._count.templates,
  };
}

export async function isSetupRequired(): Promise<boolean> {
  const count = await prisma.localAdmin.count();
  return count === 0;
}

export async function createInitialAdmin(body: unknown) {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!payload) throw new Error("请求体无效。");

  const username = normalizeUsername(payload.username);
  const password = normalizePassword(payload.password);
  const passwordConfirm = normalizePassword(payload.passwordConfirm);

  const usernameError = validateUsername(username);
  if (usernameError) throw new Error(usernameError);

  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(passwordError);
  if (password !== passwordConfirm) throw new Error("两次输入的密码不一致。");

  const existingCount = await prisma.localAdmin.count();
  if (existingCount > 0) throw new Error("系统已初始化，请直接登录。");

  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.localAdmin.create({
    data: { username, passwordHash, lastLoginAt: new Date() },
    select: { id: true, username: true },
  });
}

export async function verifyLocalUser(usernameInput: unknown, passwordInput: unknown) {
  const username = normalizeUsername(usernameInput);
  const password = normalizePassword(passwordInput);
  if (!username || !password) return null;

  const admin = await prisma.localAdmin.findUnique({
    where: { username },
    select: { id: true, username: true, passwordHash: true },
  });
  if (!admin) return null;

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) return null;

  await prisma.localAdmin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  return { id: admin.id, username: admin.username };
}

export async function listLocalUsers(): Promise<LocalUserSummary[]> {
  const rows = await prisma.localAdmin.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      username: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
      _count: {
        select: {
          subscriptions: true,
          templates: true,
        },
      },
    },
  });
  return rows.map(formatUserSummary);
}

export async function updateLocalUserAccount(
  actorId: string,
  body: unknown
): Promise<{ id: string; username: string }> {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!payload) throw new Error("请求体无效。");

  const username = "username" in payload ? normalizeUsername(payload.username) : null;
  const currentPassword = normalizePassword(payload.currentPassword);
  const nextPassword = "newPassword" in payload ? normalizePassword(payload.newPassword) : "";
  const passwordConfirm = "passwordConfirm" in payload ? normalizePassword(payload.passwordConfirm) : "";

  const user = await prisma.localAdmin.findUnique({
    where: { id: actorId },
    select: { id: true, username: true, passwordHash: true },
  });
  if (!user) throw new Error("用户不存在。");

  const data: { username?: string; passwordHash?: string } = {};

  if (username !== null && username !== user.username) {
    const usernameError = validateUsername(username);
    if (usernameError) throw new Error(usernameError);
    data.username = username;
  }

  if (nextPassword || passwordConfirm) {
    if (!currentPassword) throw new Error("修改密码时必须填写当前密码。");
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new Error("当前密码不正确。");

    const passwordError = validatePassword(nextPassword);
    if (passwordError) throw new Error(passwordError);
    if (nextPassword !== passwordConfirm) throw new Error("两次输入的新密码不一致。");
    data.passwordHash = await bcrypt.hash(nextPassword, 12);
  }

  if (Object.keys(data).length === 0) {
    return { id: user.id, username: user.username };
  }

  return prisma.localAdmin.update({
    where: { id: user.id },
    data,
    select: { id: true, username: true },
  });
}

export async function createLocalUser(body: unknown): Promise<{ id: string; username: string }> {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!payload) throw new Error("请求体无效。");

  const username = normalizeUsername(payload.username);
  const password = normalizePassword(payload.password);
  const passwordConfirm = normalizePassword(payload.passwordConfirm);

  const usernameError = validateUsername(username);
  if (usernameError) throw new Error(usernameError);
  const passwordError = validatePassword(password);
  if (passwordError) throw new Error(passwordError);
  if (password !== passwordConfirm) throw new Error("两次输入的密码不一致。");

  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.localAdmin.create({
    data: { username, passwordHash },
    select: { id: true, username: true },
  });
}
