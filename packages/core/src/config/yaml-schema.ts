import {
  binaryTag, COLLECTION_STYLE, constructFromEvents, CORE_SCHEMA, defineMappingTag,
  defineScalarTag, EVENT_ID, floatCoreTag, intCoreTag, legacyMapTag, mergeTag,
  NOT_RESOLVED, omapTag, pairsTag, parseEvents, timestampTag, YAMLException,
  type Event, type Schema,
} from "js-yaml";
import { normalizeLegacyFlowIndent } from "./yaml-flow-indent";

export const MIHOMO_YAML_INTEGER_TAG = defineScalarTag("tag:yaml.org,2002:int", {
  ...intCoreTag,
  resolve: (value) => {
    const unsigned = value.replace(/^[+-]/, "");
    if (!/^(?:\d+|0x[\da-fA-F]+|0o[0-7]+|0b[01]+)$/.test(unsigned)) return NOT_RESOLVED;
    const number = unsigned === "0" ? 0 : Number(unsigned) * (value.startsWith("-") ? -1 : 1);
    return Number.isFinite(number) ? number : NOT_RESOLVED;
  },
});

const floatTag = defineScalarTag("tag:yaml.org,2002:float", {
  ...floatCoreTag,
  resolve: (value, isExplicit, tagName) => /^[+-]\.\d/.test(value)
    ? NOT_RESOLVED
    : floatCoreTag.resolve(value, isExplicit, tagName),
});

const setTag = defineMappingTag("tag:yaml.org,2002:set", {
  ...legacyMapTag,
  addPair: (set, key, value) => value === null
    ? legacyMapTag.addPair(set, key, value)
    : "Set entries must have null values",
  identify: () => false,
});

// Preserve subscription merge keys, scalar tags and mapping keys across YAML upgrades.
export const MIHOMO_YAML_SCHEMA = CORE_SCHEMA.withTags(
  binaryTag, timestampTag, mergeTag, legacyMapTag, omapTag, pairsTag, setTag,
  MIHOMO_YAML_INTEGER_TAG, floatTag,
);

function nextSyntaxPosition(content: string, from: number): number {
  let position = from;
  while (position < content.length) {
    if (/[ \t\r\n"'\[\]{},]/.test(content[position])) position += 1;
    else if (content[position] === "#") {
      while (position < content.length && !/[\r\n]/.test(content[position])) position += 1;
    } else break;
  }
  return position;
}

function validateMappingKeys(content: string, events: Event[]): void {
  const parents: Array<{ mapping: boolean; block: boolean; nextKey: boolean }> = [];
  let position = 0;
  for (const event of events) {
    if (event.type === EVENT_ID.POP) { parents.pop(); continue; }
    if (event.type === EVENT_ID.DOCUMENT) {
      parents.push({ mapping: false, block: false, nextKey: false });
      continue;
    }
    const parent = parents.at(-1);
    const isKey = parent?.mapping && parent.nextKey;
    if (parent?.mapping) parent.nextKey = !parent.nextKey;
    if (event.type === EVENT_ID.SCALAR && event.valueStart < 0 && event.tagStart < 0 && event.anchorStart < 0) {
      const token = nextSyntaxPosition(content, position);
      // A bare ':' has no key node in a block map. Explicit '?' and flow-map empty keys remain valid.
      if (isKey && parent?.block && content[token] === ":") {
        YAMLException.throwAt(content, token, "incomplete explicit mapping pair; a key node is missed");
      }
      if (content[token] === ":" || (isKey && content[token] === "?")) position = token + 1;
    }
    position = Math.max(position, event.anchorEnd, "tagEnd" in event ? event.tagEnd : -1,
      "valueEnd" in event ? event.valueEnd : -1, "start" in event ? event.start : -1);
    if (event.type === EVENT_ID.MAPPING || event.type === EVENT_ID.SEQUENCE) {
      parents.push({ mapping: event.type === EVENT_ID.MAPPING, block: event.style === COLLECTION_STYLE.BLOCK, nextKey: true });
    }
  }
}

export function loadMihomoYaml(
  content: string,
  schema: Schema = MIHOMO_YAML_SCHEMA,
  beforeConstruct?: (source: string, events: Event[]) => void,
  beforeParse?: (source: string) => void,
): unknown {
  let events: Event[];
  try {
    beforeParse?.(content);
    events = parseEvents(content, {});
  } catch (error) {
    if (!(error instanceof YAMLException) || error.reason !== "deficient indentation") throw error;
    const normalized = normalizeLegacyFlowIndent(content);
    if (normalized === content) throw error;
    content = normalized;
    beforeParse?.(content);
    events = parseEvents(content, {});
  }
  beforeConstruct?.(content, events);
  validateMappingKeys(content, events);
  const documents = constructFromEvents(events, { source: content, schema });
  if (documents.length > 1) throw new YAMLException("expected a single document in the stream, but found more");
  // The previous loader distinguished spaces with one optional line break from empty documents.
  return documents.length ? documents[0] : /^ *[\r\n]?$/.test(content.replace(/^\uFEFF/, "")) ? undefined : null;
}
