// These limits apply to one subscription, before it can be saved or generated.
export const MAX_SUBSCRIPTION_CONTENT_LENGTH = 10 * 1024 * 1024;
export const MAX_SUBSCRIPTION_OUTPUT_LENGTH = 16 * 1024 * 1024;
export const MAX_SUBSCRIPTION_ITEMS = 10_000;
export const MAX_SUBSCRIPTION_ERRORS = 100;
export const MAX_SUBSCRIPTION_ERROR_LENGTH = 512;
export const MAX_SUBSCRIPTION_LINES = 200_000;
export const MAX_YAML_EXPANDED_NODES = 250_000;
export const MAX_YAML_EXPANDED_TEXT = 32 * 1024 * 1024;
export const MAX_YAML_DEPTH = 100;

const LIMIT_PREFIX = "订阅解析受限:";

export class SubscriptionParseLimitError extends Error {
  constructor(reason: string) {
    super(boundSubscriptionError(`${LIMIT_PREFIX} ${reason}`));
    this.name = "SubscriptionParseLimitError";
  }
}

export function boundSubscriptionError(message: string, maxLength = MAX_SUBSCRIPTION_ERROR_LENGTH): string {
  return message.length > maxLength ? `${message.slice(0, maxLength - 1)}…` : message;
}

export function isSubscriptionParseLimitMessage(message: string): boolean {
  return message.startsWith(LIMIT_PREFIX);
}

export function checkSubscriptionInput(content: string): void {
  if (content.length > MAX_SUBSCRIPTION_CONTENT_LENGTH) {
    throw new SubscriptionParseLimitError("输入内容超过大小上限");
  }
  let lines = 1;
  for (let index = 0; index < content.length; index += 1) {
    const char = content.charCodeAt(index);
    if ((char === 13 || (char === 10 && content.charCodeAt(index - 1) !== 13)) && ++lines > MAX_SUBSCRIPTION_LINES) {
      throw new SubscriptionParseLimitError("输入行数超过上限");
    }
  }
}

export function checkSubscriptionItems(count: number): void {
  if (count > MAX_SUBSCRIPTION_ITEMS) throw new SubscriptionParseLimitError("节点或分段数量超过上限");
}

export function addSubscriptionError(errors: string[], error: string): void {
  if (errors.length >= MAX_SUBSCRIPTION_ERRORS) throw new SubscriptionParseLimitError("解析错误数量超过上限");
  errors.push(boundSubscriptionError(error));
}
