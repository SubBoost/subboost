export type ApiErrorBody<Code extends string = string> = {
  error: string;
  code: Code;
};

export function buildApiErrorBody<Code extends string>(
  error: string,
  code: Code
): ApiErrorBody<Code> {
  return { error, code };
}

export type ReadJsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "invalid_json" | "too_large" };

export async function readJsonBody(request: Request, maxBytes: number): Promise<ReadJsonBodyResult> {
  const limit = Math.max(1, Math.floor(maxBytes));
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) return { ok: false, reason: "too_large" };
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
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: text.trim() ? JSON.parse(text) : {} };
  } catch { return { ok: false, reason: "invalid_json" }; }
  finally { reader.releaseLock(); }
}
