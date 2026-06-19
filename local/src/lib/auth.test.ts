import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(),
  findUnique: vi.fn(),
  count: vi.fn(),
  isLanMode: vi.fn(),
  ensureLanAdmin: vi.fn(),
}));

vi.mock("@local/lib/session", () => ({ readSession: mocks.readSession }));
vi.mock("@local/lib/prisma", () => ({
  prisma: {
    localAdmin: {
      findUnique: mocks.findUnique,
      count: mocks.count,
    },
  },
}));
vi.mock("@local/lib/lan-mode", () => ({
  isLanMode: mocks.isLanMode,
  ensureLanAdmin: mocks.ensureLanAdmin,
}));

import { getCurrentAdmin, isSetupRequired } from "./auth";

describe("auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isLanMode.mockReturnValue(false);
  });

  describe("getCurrentAdmin", () => {
    it("returns the session admin when a valid session exists (LAN off)", async () => {
      mocks.readSession.mockResolvedValue({ adminId: "a1", username: "ry" });
      mocks.findUnique.mockResolvedValue({ id: "a1", username: "ry" });
      expect(await getCurrentAdmin()).toEqual({ id: "a1", username: "ry" });
      expect(mocks.ensureLanAdmin).not.toHaveBeenCalled();
    });

    it("returns null when there is no session (LAN off)", async () => {
      mocks.readSession.mockResolvedValue(null);
      expect(await getCurrentAdmin()).toBeNull();
      expect(mocks.ensureLanAdmin).not.toHaveBeenCalled();
    });

    it("returns null when the session points at a deleted admin (LAN off)", async () => {
      mocks.readSession.mockResolvedValue({ adminId: "gone", username: "ry" });
      mocks.findUnique.mockResolvedValue(null);
      expect(await getCurrentAdmin()).toBeNull();
    });

    it("uses the LAN default admin and ignores any session when LAN mode is on", async () => {
      mocks.isLanMode.mockReturnValue(true);
      mocks.ensureLanAdmin.mockResolvedValue({ id: "lan", username: "admin" });
      // 即便带着有效 session，LAN 模式也应忽略它，统一返回默认管理员。
      mocks.readSession.mockResolvedValue({ adminId: "a1", username: "ry" });
      expect(await getCurrentAdmin()).toEqual({ id: "lan", username: "admin" });
      expect(mocks.readSession).not.toHaveBeenCalled();
      expect(mocks.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("isSetupRequired", () => {
    it("is false in LAN mode without counting admins", async () => {
      mocks.isLanMode.mockReturnValue(true);
      expect(await isSetupRequired()).toBe(false);
      expect(mocks.count).not.toHaveBeenCalled();
    });

    it("reflects the admin count when LAN mode is off", async () => {
      mocks.count.mockResolvedValue(0);
      expect(await isSetupRequired()).toBe(true);
      mocks.count.mockResolvedValue(2);
      expect(await isSetupRequired()).toBe(false);
    });
  });
});
