import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(),
  findUnique: vi.fn(),
  count: vi.fn(),
}));

vi.mock("./session", () => ({ readSession: mocks.readSession }));
vi.mock("./prisma", () => ({
  prisma: {
    localAdmin: {
      findUnique: mocks.findUnique,
      count: mocks.count,
    },
  },
}));

import { getCurrentAdmin, isSetupRequired, normalizeLocalAdminRole } from "./auth";

describe("local auth helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes unknown roles to a regular account", () => {
    expect(normalizeLocalAdminRole("ADMIN")).toBe("ADMIN");
    expect(normalizeLocalAdminRole("USER")).toBe("USER");
    expect(normalizeLocalAdminRole("superuser")).toBe("USER");
    expect(normalizeLocalAdminRole(undefined)).toBe("USER");
  });

  it("returns null without a session or without a matching account", async () => {
    mocks.readSession.mockResolvedValue(null);
    await expect(getCurrentAdmin()).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();

    mocks.readSession.mockResolvedValue({ adminId: "admin-1", username: "root" });
    mocks.findUnique.mockResolvedValue(null);
    await expect(getCurrentAdmin()).resolves.toBeNull();
  });

  it("marks the administrator account and regular accounts", async () => {
    mocks.readSession
      .mockResolvedValueOnce({ adminId: "admin-1", username: "root" })
      .mockResolvedValueOnce({ adminId: "user-1", username: "friend" });
    mocks.findUnique.mockResolvedValueOnce({ id: "admin-1", username: "root", role: "ADMIN" });
    await expect(getCurrentAdmin()).resolves.toEqual({
      id: "admin-1",
      username: "root",
      role: "ADMIN",
      isAdmin: true,
    });
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      select: { id: true, username: true, role: true },
    });

    mocks.findUnique.mockResolvedValueOnce({ id: "user-1", username: "friend", role: "USER" });
    await expect(getCurrentAdmin()).resolves.toEqual({
      id: "user-1",
      username: "friend",
      role: "USER",
      isAdmin: false,
    });
  });

  it("reports setup as required only when no account exists", async () => {
    mocks.count.mockResolvedValueOnce(0).mockResolvedValueOnce(2);
    await expect(isSetupRequired()).resolves.toBe(true);
    await expect(isSetupRequired()).resolves.toBe(false);
  });
});
