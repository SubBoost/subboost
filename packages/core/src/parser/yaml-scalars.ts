import * as yaml from "js-yaml";
import { loadMihomoYaml, MIHOMO_YAML_INTEGER_TAG, MIHOMO_YAML_SCHEMA } from "../config/yaml-schema";
import { MIHOMO_STRING_SCALAR_FIELDS } from "../mihomo/string-scalar";
import { checkSubscriptionInput, SubscriptionParseLimitError } from "./limits";
import { checkYamlExpansionBudget, checkYamlSyntaxBudget } from "./yaml-budget";

class YamlInteger extends Number {
  // Number's native tag keeps js-yaml's mapping-key semantics unchanged.
  constructor(readonly text: string, readonly number: number) { super(number); }
}

const integerType = yaml.defineScalarTag("tag:yaml.org,2002:int", {
  ...MIHOMO_YAML_INTEGER_TAG,
  resolve: (value, isExplicit, tagName) => {
    const number = MIHOMO_YAML_INTEGER_TAG.resolve(value, isExplicit, tagName);
    return number === yaml.NOT_RESOLVED ? number : new YamlInteger(value, number);
  },
  identify: () => false,
});
const scalarSchema = MIHOMO_YAML_SCHEMA.withTags(integerType);

function integerText(text: string): string {
  const plain = text.replace(/_/g, "");
  // Preserve decimal credentials exactly, including leading zeroes and large integers.
  if (/^[+-]?\d+$/.test(plain)) return plain;
  const negative = plain.startsWith("-");
  const unsigned = plain.replace(/^[+-]/, "");
  return `${negative ? "-" : ""}${BigInt(unsigned).toString(10)}`;
}

export function loadSubscriptionYaml(content: string): unknown {
  checkSubscriptionInput(content);
  checkYamlSyntaxBudget(content);
  let parsed: unknown;
  try {
    parsed = loadMihomoYaml(content, scalarSchema, checkYamlExpansionBudget);
  } catch (error) {
    if (error instanceof yaml.YAMLException && /(?:maxDepth|maxTotalMergeKeys|maxAliases)/.test(error.reason)) {
      throw new SubscriptionParseLimitError(`YAML 超过解析预算: ${error.reason}`);
    }
    throw error;
  }
  const seen = new WeakMap<object, unknown>();
  const normalize = (value: unknown, field = ""): unknown => {
    if (value instanceof YamlInteger) {
      return MIHOMO_STRING_SCALAR_FIELDS.has(field) ? integerText(value.text) : value.number;
    }
    if (!value || typeof value !== "object") return value;
    if (value instanceof Date || value instanceof Uint8Array) return value;
    if (seen.has(value)) return seen.get(value);
    if (Array.isArray(value)) {
      const out: unknown[] = [];
      seen.set(value, out);
      for (const item of value) out.push(normalize(item));
      return out;
    }
    const out: Record<string, unknown> = {};
    seen.set(value, out);
    for (const [key, child] of Object.entries(value)) {
      Object.defineProperty(out, key, { value: normalize(child, key), enumerable: true, writable: true, configurable: true });
    }
    return out;
  };
  return normalize(parsed);
}
