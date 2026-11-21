import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  readFile: vi.fn(),
  lstat: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@local/lib/auth", () => ({ getCurrentAdmin: mocks.admin }));
vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile,
  lstat: mocks.lstat,
  writeFile: mocks.writeFile,
}));

import { GET, POST } from "./route";

const origin = "https://local.test";
const missing = Object.assign(new Error("No such file"), { code: "ENOENT" });

function postRequest(requestOrigin = origin, body?: string) {
  return new Request(`${origin}/api/settings/web-update`, {
    method: "POST",
    headers: { Origin: requestOrigin },
    body,
  });
}

describe("local web updates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("APP_URL", origin);
    mocks.admin.mockResolvedValue({ id: "admin-1", username: "admin" });
    mocks.readFile.mockResolvedValue("idle\n");
    mocks.lstat.mockRejectedValue(missing);
  });

  afterEach(() => vi.unstubAllEnvs());

  it("requires an administrator and a same-origin POST", async () => {
    mocks.admin.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(postRequest())).status).toBe(401);
    expect((await POST(postRequest("https://other.test"))).status).toBe(403);
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("queues a fixed marker without forwarding browser data", async () => {
    expect((await POST(postRequest(origin, '{"release":"custom-release"}'))).status).toBe(202);
    expect(mocks.writeFile).toHaveBeenCalledWith("/run/subboost-web-update/request/pending", "", {
      flag: "wx",
      mode: 0o600,
    });
  });

  it("leaves updates disabled without the host service state", async () => {
    mocks.readFile.mockRejectedValue(missing);
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "disabled" });
    expect((await POST(postRequest())).status).toBe(404);
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });

  it("queues one operation when two requests race", async () => {
    mocks.writeFile.mockResolvedValueOnce(undefined);
    mocks.writeFile.mockRejectedValueOnce(Object.assign(new Error("Already exists"), { code: "EEXIST" }));
    const responses = await Promise.all([POST(postRequest()), POST(postRequest())]);
    expect(responses.map((response) => response.status).sort()).toEqual([202, 409]);
  });

  it("reads the host status after a restart and rejects a request while running", async () => {
    mocks.readFile.mockResolvedValue("running\n");
    expect(await (await GET()).json()).toEqual({ status: "running" });
    expect((await POST(postRequest())).status).toBe(409);
    mocks.readFile.mockResolvedValue("succeeded\n");
    expect(await (await GET()).json()).toEqual({ status: "succeeded" });
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
});
