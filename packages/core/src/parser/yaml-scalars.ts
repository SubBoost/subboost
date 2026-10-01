import yaml from "js-yaml";
import { MIHOMO_STRING_SCALAR_FIELDS } from "../mihomo/string-scalar";

class YamlInteger extends Number {
  // Number's native tag keeps js-yaml's mapping-key semantics unchanged.
  constructor(readonly text: string, readonly number: number) { super(number); }
}

// The bundled schema exposes its scalar types; @types/js-yaml omits that member.
const standardInteger = (yaml.DEFAULT_SCHEMA as yaml.Schema & { implicit: yaml.Type[] }).implicit
  .find((type) => (type as yaml.Type & { tag: string }).tag === "tag:yaml.org,2002:int")!;
const integerType = new yaml.Type("tag:yaml.org,2002:int", {
  kind: "scalar",
  resolve: (value: string) => standardInteger.resolve(value),
  construct: (value: string) => new YamlInteger(value, standardInteger.construct(value)),
});
const scalarSchema = yaml.DEFAULT_SCHEMA.extend({ implicit: [integerType] });

function integerText(text: string): string {
  const plain = text.replace(/_/g, "");
  // Preserve decimal credentials exactly, including leading zeroes and large integers.
  if (/^[+-]?\d+$/.test(plain)) return plain;
  const negative = plain.startsWith("-");
  const unsigned = plain.replace(/^[+-]/, "");
  return `${negative ? "-" : ""}${BigInt(unsigned).toString(10)}`;
}

export function loadSubscriptionYaml(content: string): unknown {
  const parsed: unknown = yaml.load(content, { schema: scalarSchema });
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
