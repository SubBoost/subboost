import { detectRuleContent } from "@subboost/core/rules/rule-content-detection";
import { parseRuleSetUrl } from "@subboost/core/rules/rule-model";
import { readJsonBody } from "../http";

/** Shells authenticate/rate-limit first and supply their existing guarded transport. */
export async function handleRuleDetection(request: Request, fetchContent: (url: string) => Promise<string | null>): Promise<Response> {
  const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const body = await readJsonBody(request, 64 * 1024);
  if (!body.ok) return json({ error: body.reason === "too_large" ? "请求内容过大" : "请求格式无效", code: "BAD_REQUEST" }, body.reason === "too_large" ? 413 : 400);
  const value = body.value;
  let parsed: ReturnType<typeof parseRuleSetUrl>;
  try {
    if (!value || typeof value !== "object" || !("url" in value) || typeof value.url !== "string") throw new Error();
    parsed = parseRuleSetUrl(value.url);
  } catch { return json({ error: "请输入有效的规则集 HTTP/HTTPS 链接", code: "BAD_REQUEST" }, 400); }
  let content: string | null;
  try { content = await fetchContent(parsed.path); } catch { content = null; }
  if (content === null) return json({ error: "无法读取规则文件，请检查链接或稍后重试", code: "FETCH_FAILED" }, 422);
  try { return json({ name: parsed.name, path: parsed.path, ...detectRuleContent(content) }, 200); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "无法识别规则文件", code: "UNSUPPORTED_RULE_CONTENT" }, 422); }
}
