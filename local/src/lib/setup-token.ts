import { createHash, timingSafeEqual } from "node:crypto";

export const LOCAL_SETUP_TOKEN_HEADER = "x-subboost-setup-token";

export function validateLocalSetupToken(request: Request): "valid" | "invalid" | "missing_config" {
  const expected = process.env.LOCAL_SETUP_TOKEN;
  if (!expected) return "missing_config";

  const supplied = request.headers.get(LOCAL_SETUP_TOKEN_HEADER);
  if (!supplied) return "invalid";

  const expectedDigest = createHash("sha256").update(expected).digest();
  const suppliedDigest = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest) ? "valid" : "invalid";
}
