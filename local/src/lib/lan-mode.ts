import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { LOCAL_ADMIN_PASSWORD_MIN_LENGTH } from "./admin-credentials";
import { prisma } from "./prisma";
import type { CurrentAdmin } from "./auth";

/**
 * 局域网模式（LAN mode）。
 *
 * 开启后跳过登录鉴权，自动使用一个默认管理员账号——适合在可信内网里一键自托管，
 * 免去创建账号与登录的步骤。
 *
 * ⚠️ 安全提示：该模式会彻底关闭鉴权。请仅在可信内网使用，切勿将应用暴露到公网。
 * 默认关闭，必须显式设置 SUBBOOST_LAN_MODE=true 才会生效。
 */

const DEFAULT_LAN_ADMIN_USERNAME = "admin";

/**
 * 默认管理员用户名白名单：仅允许字母、数字、点、下划线、连字符，长度 1-64。
 * 即便用户名来自环境变量，也不会把控制字符（如换行）带入日志，杜绝日志注入。
 * （数据库写入本身走 Prisma 参数化查询，不存在 SQL 注入风险。）
 */
const LAN_ADMIN_USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const BCRYPT_COST = 12;

let lanModeWarningEmitted = false;

export function isLanMode(): boolean {
  return process.env.SUBBOOST_LAN_MODE === "true";
}

export function getLanAdminUsername(): string {
  const raw = (process.env.SUBBOOST_LAN_ADMIN_USERNAME ?? "").trim();
  if (!raw) return DEFAULT_LAN_ADMIN_USERNAME;
  if (!LAN_ADMIN_USERNAME_PATTERN.test(raw)) {
    throw new Error(
      "SUBBOOST_LAN_ADMIN_USERNAME 仅允许字母、数字、点、下划线、连字符，长度 1-64。"
    );
  }
  return raw;
}

/**
 * 计算默认管理员的密码哈希：
 * - 若设置了 SUBBOOST_LAN_ADMIN_PASSWORD，则对其做 bcrypt（这样即便日后关闭局域网模式，
 *   仍可用该账号正常登录）；长度不足时直接抛错（fail-fast），不写入弱口令。
 * - 未设置时存入一段随机不可猜的哈希，等于禁用密码登录（局域网模式下本就免登录）。
 */
async function buildLanAdminPasswordHash(): Promise<string> {
  const password = process.env.SUBBOOST_LAN_ADMIN_PASSWORD ?? "";
  if (password) {
    if (password.length < LOCAL_ADMIN_PASSWORD_MIN_LENGTH) {
      throw new Error(`SUBBOOST_LAN_ADMIN_PASSWORD 至少需要 ${LOCAL_ADMIN_PASSWORD_MIN_LENGTH} 个字符。`);
    }
    return bcrypt.hash(password, BCRYPT_COST);
  }
  return bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_COST);
}

function warnLanModeOnce(username: string): void {
  if (lanModeWarningEmitted) return;
  lanModeWarningEmitted = true;
  console.warn(
    `[subboost] 局域网模式已开启：已跳过登录鉴权，默认管理员 "${username}"。` +
      " 请仅在可信内网使用，切勿暴露公网。"
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  // Prisma 唯一约束冲突的错误码为 P2002（PrismaClientKnownRequestError.code）。
  return Boolean(error) && typeof error === "object" && (error as { code?: unknown }).code === "P2002";
}

/**
 * 确保默认管理员存在并返回它。
 *
 * 先按用户名查找：命中则直接返回，不重复创建、也不重算密码哈希。未命中则创建；
 * 并发首启时可能有另一个请求抢先插入同名管理员，此时 create 会命中唯一约束（P2002），
 * 捕获后回读返回即可（race-safe get-or-create，不依赖 upsert 的原子性）。全程仅用 Prisma 客户端 API。
 */
export async function ensureLanAdmin(): Promise<CurrentAdmin> {
  const username = getLanAdminUsername();
  warnLanModeOnce(username);

  const existing = await prisma.localAdmin.findUnique({
    where: { username },
    select: { id: true, username: true },
  });
  if (existing) return existing;

  const passwordHash = await buildLanAdminPasswordHash();
  try {
    return await prisma.localAdmin.create({
      data: { username, passwordHash },
      select: { id: true, username: true },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const raced = await prisma.localAdmin.findUnique({
        where: { username },
        select: { id: true, username: true },
      });
      if (raced) return raced;
    }
    throw error;
  }
}
