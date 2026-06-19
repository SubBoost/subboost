import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
}));

vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@local/lib/prisma", () => ({
  prisma: {
    localAdmin: {
      findUnique: mocks.findUnique,
      create: mocks.create,
    },
  },
}));

import { ensureLanAdmin, getLanAdminUsername, isLanMode } from "./lan-mode";

const ENV_KEYS = ["SUBBOOST_LAN_MODE", "SUBBOOST_LAN_ADMIN_USERNAME", "SUBBOOST_LAN_ADMIN_PASSWORD"] as const;

describe("lan-mode", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
    mocks.hash.mockResolvedValue("hashed");
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  describe("isLanMode", () => {
    it("defaults to false and only accepts the exact string 'true'", () => {
      expect(isLanMode()).toBe(false);
      process.env.SUBBOOST_LAN_MODE = "false";
      expect(isLanMode()).toBe(false);
      process.env.SUBBOOST_LAN_MODE = "1";
      expect(isLanMode()).toBe(false);
      process.env.SUBBOOST_LAN_MODE = "TRUE";
      expect(isLanMode()).toBe(false);
      process.env.SUBBOOST_LAN_MODE = "true";
      expect(isLanMode()).toBe(true);
    });
  });

  describe("getLanAdminUsername", () => {
    it("returns the default when unset or blank", () => {
      expect(getLanAdminUsername()).toBe("admin");
      process.env.SUBBOOST_LAN_ADMIN_USERNAME = "   ";
      expect(getLanAdminUsername()).toBe("admin");
    });

    it("accepts a whitelisted custom username", () => {
      process.env.SUBBOOST_LAN_ADMIN_USERNAME = "home.admin_1-x";
      expect(getLanAdminUsername()).toBe("home.admin_1-x");
    });

    it("rejects usernames with spaces, control chars, punctuation, non-ascii, or overlength", () => {
      for (const bad of ["a b", "a;b", "a\nb", "drop'table", "名字", "x".repeat(65)]) {
        process.env.SUBBOOST_LAN_ADMIN_USERNAME = bad;
        expect(() => getLanAdminUsername()).toThrow();
      }
    });
  });

  describe("ensureLanAdmin", () => {
    it("returns the existing admin without creating or hashing", async () => {
      mocks.findUnique.mockResolvedValue({ id: "a1", username: "admin" });
      const admin = await ensureLanAdmin();
      expect(admin).toEqual({ id: "a1", username: "admin" });
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.hash).not.toHaveBeenCalled();
    });

    it("creates the default admin with a random hash when missing", async () => {
      mocks.findUnique.mockResolvedValue(null);
      mocks.create.mockResolvedValue({ id: "a2", username: "admin" });
      const admin = await ensureLanAdmin();
      expect(admin).toEqual({ id: "a2", username: "admin" });
      expect(mocks.hash).toHaveBeenCalledTimes(1);
      expect(mocks.create).toHaveBeenCalledWith({
        data: { username: "admin", passwordHash: "hashed" },
        select: { id: true, username: true },
      });
    });

    it("hashes a provided password but fails fast when it is too short", async () => {
      mocks.findUnique.mockResolvedValue(null);
      process.env.SUBBOOST_LAN_ADMIN_PASSWORD = "short";
      await expect(ensureLanAdmin()).rejects.toThrow();
      expect(mocks.create).not.toHaveBeenCalled();

      process.env.SUBBOOST_LAN_ADMIN_PASSWORD = "a-strong-password";
      mocks.create.mockResolvedValue({ id: "a3", username: "admin" });
      await ensureLanAdmin();
      expect(mocks.hash).toHaveBeenCalledWith("a-strong-password", 12);
    });

    it("re-reads the admin when a concurrent insert wins the race (P2002)", async () => {
      mocks.findUnique
        .mockResolvedValueOnce(null) // 首次查找：不存在
        .mockResolvedValueOnce({ id: "raced", username: "admin" }); // 冲突后回读
      mocks.create.mockRejectedValue({ code: "P2002" });
      const admin = await ensureLanAdmin();
      expect(admin).toEqual({ id: "raced", username: "admin" });
    });

    it("rethrows errors from create that are not unique-constraint violations", async () => {
      mocks.findUnique.mockResolvedValue(null);
      mocks.create.mockRejectedValue(new Error("db down"));
      await expect(ensureLanAdmin()).rejects.toThrow("db down");
    });
  });
});
