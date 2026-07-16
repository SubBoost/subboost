import { NextResponse } from "next/server";
import { buildApiErrorBody } from "@subboost/server-core/http";

export type LocalApiErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "PAYLOAD_TOO_LARGE"
  | "CONFIGURATION_ERROR"
  | "INTERNAL_ERROR";

export const LOCAL_JSON_BODY_LIMITS = {
  small: 64 * 1024,
  subscription: 16 * 1024 * 1024,
  template: 4 * 1024 * 1024,
} as const;

export type ReadJsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "invalid_json" | "too_large" };

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function apiError(error: string, code: LocalApiErrorCode, status: number): NextResponse {
  return NextResponse.json(buildApiErrorBody(error, code), { status });
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<ReadJsonBodyResult> {
  const limit = Math.max(1, Math.floor(maxBytes));
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    return { ok: false, reason: "too_large" };
  }

  if (!request.body) return { ok: true, value: {} };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > limit) {
        await reader.cancel("payload too large").catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!text.trim()) return { ok: true, value: {} };
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
}

export function jsonBodyError(
  result: Extract<ReadJsonBodyResult, { ok: false }>,
  invalidJsonMessage = "Invalid JSON body."
): NextResponse {
  return result.reason === "too_large"
    ? apiError("Request body is too large.", "PAYLOAD_TOO_LARGE", 413)
    : apiError(invalidJsonMessage, "BAD_REQUEST", 400);
}

export function getStringField(body: unknown, key: string): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}
