import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const publicRoot = fileURLToPath(new URL("../../../..", import.meta.url));

describe("public subscription bearer credential guidance", () => {
  it("warns in both READMEs that token traffic belongs to the owner and may temporarily ban the owner", () => {
    const chinese = fs.readFileSync(`${publicRoot}/README-CN.md`, "utf8");
    const english = fs.readFileSync(`${publicRoot}/README.md`, "utf8");

    expect(chinese).toContain("持有者即可使用");
    expect(chinese).toContain("匿名请求和第三方客户端请求");
    expect(chinese).toContain("临时封禁订阅所有者");

    expect(english).toContain("bearer credentials");
    expect(english).toContain("anonymous requests and requests from third-party clients");
    expect(english).toContain("temporarily ban the owner's account");
  });
});
