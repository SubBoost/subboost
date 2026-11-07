import {
  EVENT_ID,
  eventsToAst,
  parseEvents,
  present,
  SCALAR_STYLE,
  type Document,
  type MappingNode,
  type Node,
  type ScalarNode,
} from "js-yaml";
import { MIHOMO_YAML_SCHEMA } from "../config/yaml-schema";
import { isValidTailscaleControlUrl, tailscaleStateDirComparisonKey } from "../mihomo/tailscale";
import { parseClashYaml } from "../parser/clash-yaml";
import { loadSubscriptionYaml } from "../parser/yaml-scalars";
import { stableJsonStringify } from "../node-identity";

/** Explicit three-state value: Default omits the YAML key. */
export type TailscaleTriState = "default" | "true" | "false";

export interface TailscaleFormValues {
  name: string;
  hostname: string;
  authKey: string;
  controlUrl: string;
  stateDir: string;
  exitNode: string;
  ephemeral: TailscaleTriState;
  udp: TailscaleTriState;
  acceptRoutes: TailscaleTriState;
  exitNodeAllowLanAccess: TailscaleTriState;
}

export type TailscaleFormField = keyof TailscaleFormValues;
export type TailscaleFormErrors = Partial<Record<TailscaleFormField, string>>;

/** A parsed, form-eligible YAML document. The source text stays the persisted authority. */
export interface TailscaleSourceDocument {
  readonly content: string;
  readonly initial: TailscaleFormValues;
}

export type TailscaleSourceParseResult =
  | { ok: true; document: TailscaleSourceDocument }
  | { ok: false; reason: string };

const STRING_FIELDS = {
  name: "name",
  hostname: "hostname",
  authKey: "auth-key",
  controlUrl: "control-url",
  stateDir: "state-dir",
  exitNode: "exit-node",
} as const satisfies Partial<Record<TailscaleFormField, string>>;

const BOOLEAN_FIELDS = {
  ephemeral: "ephemeral",
  udp: "udp",
  acceptRoutes: "accept-routes",
  exitNodeAllowLanAccess: "exit-node-allow-lan-access",
} as const satisfies Partial<Record<TailscaleFormField, string>>;

const FORM_FIELDS = [...Object.keys(STRING_FIELDS), ...Object.keys(BOOLEAN_FIELDS)] as TailscaleFormField[];
const KEY_BY_FIELD: Record<TailscaleFormField, string> = { ...STRING_FIELDS, ...BOOLEAN_FIELDS };

const TAG_STR = "tag:yaml.org,2002:str";
const TAG_BOOL = "tag:yaml.org,2002:bool";
const TAG_NULL = "tag:yaml.org,2002:null";
const TAG_MAP = "tag:yaml.org,2002:map";
const TAG_SEQ = "tag:yaml.org,2002:seq";

class IneligibleDocument extends Error {}

function ineligible(reason: string): never {
  throw new IneligibleDocument(reason);
}

function parseDocument(content: string): Document {
  const events = parseEvents(content, {});
  for (const event of events) {
    if (event.type === EVENT_ID.ALIAS) ineligible("包含 YAML 别名");
    if ("anchorStart" in event && event.anchorStart >= 0) ineligible("包含 YAML 锚点");
    if ("tagStart" in event && event.tagStart >= 0) ineligible("包含显式 YAML 标签");
  }
  const documents = eventsToAst(events, { source: content, schema: MIHOMO_YAML_SCHEMA });
  if (documents.length !== 1 || !documents[0].contents) ineligible("必须是单个 YAML 文档");
  return documents[0];
}

function scalarKey(node: Node): string | null {
  return node.kind === "scalar" && node.tag === TAG_STR ? node.value : null;
}

function findPair(mapping: MappingNode, key: string) {
  return mapping.items.find((item) => scalarKey(item.key) === key);
}

function assertPlainMapping(mapping: MappingNode): void {
  const keys = new Set<string>();
  for (const item of mapping.items) {
    const key = scalarKey(item.key);
    if (key === null) ineligible("代理字段名必须是字符串");
    if (key === "<<") ineligible("包含 YAML 合并键");
    if (keys.has(key)) ineligible(`字段 ${key} 重复`);
    keys.add(key);
  }
}

function locateProxy(root: Node): MappingNode {
  if (root.kind === "sequence") {
    if (root.tag !== TAG_SEQ || root.items.length !== 1) ineligible("必须只包含一个代理");
    const [proxy] = root.items;
    if (proxy.kind !== "mapping" || proxy.tag !== TAG_MAP) ineligible("代理必须是映射");
    return proxy;
  }
  if (root.kind !== "mapping" || root.tag !== TAG_MAP) ineligible("无法识别的 YAML 结构");
  assertPlainMapping(root);
  if (findPair(root, "proxy-providers")) ineligible("包含 proxy-providers");
  const proxies = findPair(root, "proxies");
  if (!proxies) return root;
  return locateProxy(proxies.value);
}

function readString(proxy: MappingNode, key: string): string {
  const pair = findPair(proxy, key);
  if (!pair) return "";
  const value = pair.value;
  if (value.kind !== "scalar") ineligible(`${key} 不是字符串`);
  if (value.tag === TAG_NULL) return "";
  if (value.tag !== TAG_STR) ineligible(`${key} 不是字符串`);
  return value.value;
}

function readTriState(proxy: MappingNode, key: string): TailscaleTriState {
  const pair = findPair(proxy, key);
  if (!pair) return "default";
  const value = pair.value;
  if (value.kind !== "scalar") ineligible(`${key} 不是布尔值`);
  if (value.tag === TAG_NULL) return "default";
  if (value.tag !== TAG_BOOL) ineligible(`${key} 不是布尔值`);
  return /^true$/i.test(value.value) ? "true" : "false";
}

function readForm(proxy: MappingNode): TailscaleFormValues {
  assertPlainMapping(proxy);
  const type = readString(proxy, "type");
  if (type.trim().toLowerCase() !== "tailscale") ineligible("不是 Tailscale 代理");
  const values = {} as TailscaleFormValues;
  for (const [field, key] of Object.entries(STRING_FIELDS)) values[field as keyof typeof STRING_FIELDS] = readString(proxy, key);
  for (const [field, key] of Object.entries(BOOLEAN_FIELDS)) values[field as keyof typeof BOOLEAN_FIELDS] = readTriState(proxy, key);
  return values;
}

function semanticKey(content: string): string {
  return stableJsonStringify(loadSubscriptionYaml(content));
}

function assertImportable(content: string): void {
  const parsed = parseClashYaml(content);
  if (parsed.errors.length > 0 || parsed.nodes.length !== 1 || parsed.nodes[0].type !== "tailscale") {
    ineligible("导入器无法将其识别为单个 Tailscale 节点");
  }
}

function presentDocument(document: Document): string {
  return present([document], { schema: MIHOMO_YAML_SCHEMA, lineWidth: -1 });
}

/** Offer the form only for exactly one unambiguous Tailscale proxy the importer accepts. */
export function parseTailscaleSourceDocument(content: string): TailscaleSourceParseResult {
  try {
    const document = parseDocument(content);
    const initial = readForm(locateProxy(document.contents!));
    assertImportable(content);
    // Keep documents whose values the serializer cannot reproduce in raw mode.
    if (semanticKey(presentDocument(document)) !== semanticKey(content)) ineligible("YAML 内容无法无损保留");
    return { ok: true, document: { content, initial } };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "YAML 无法解析" };
  }
}

export function isTailscaleFormDirty(document: TailscaleSourceDocument, values: TailscaleFormValues): boolean {
  return FORM_FIELDS.some((field) => document.initial[field] !== values[field]);
}

export function validateTailscaleForm(values: TailscaleFormValues): TailscaleFormErrors {
  const errors: TailscaleFormErrors = {};
  if (!values.name.trim()) errors.name = "请输入节点名称";
  if (values.controlUrl.trim() && !isValidTailscaleControlUrl(values.controlUrl.trim())) {
    errors.controlUrl = "请输入有效的 HTTP 或 HTTPS 地址";
  }
  return errors;
}

const PLAIN_SAFE = /^[A-Za-z][A-Za-z0-9._/@-]*$/;
const YAML_KEYWORDS = /^(?:y|n|yes|no|on|off|true|false|null)$/i;

function stringNode(value: string): ScalarNode {
  const plain = PLAIN_SAFE.test(value) && !YAML_KEYWORDS.test(value);
  return { kind: "scalar", tag: TAG_STR, tagged: false, style: plain ? SCALAR_STYLE.PLAIN : SCALAR_STYLE.DOUBLE_QUOTED, value };
}

function valueNode(field: TailscaleFormField, values: TailscaleFormValues): ScalarNode | null {
  if (field in BOOLEAN_FIELDS) {
    const state = values[field] as TailscaleTriState;
    if (state === "default") return null;
    return { kind: "scalar", tag: TAG_BOOL, tagged: false, style: SCALAR_STYLE.PLAIN, value: state };
  }
  const text = field === "name" ? values.name : (values[field] as string).trim();
  return text === "" && field !== "name" ? null : stringNode(text);
}

function setField(proxy: MappingNode, key: string, value: ScalarNode | null): void {
  const index = proxy.items.findIndex((item) => scalarKey(item.key) === key);
  if (value === null) {
    if (index >= 0) proxy.items.splice(index, 1);
    return;
  }
  if (index >= 0) proxy.items[index] = { key: proxy.items[index].key, value };
  else proxy.items.push({ key: stringNode(key), value });
}

/**
 * Serialize a valid form once. Untouched fields, sibling root keys and unknown proxy fields keep
 * their YAML values; an unchanged form returns the original bytes.
 */
export function serializeTailscaleForm(document: TailscaleSourceDocument, values: TailscaleFormValues): string {
  const errors = validateTailscaleForm(values);
  const firstError = Object.values(errors)[0];
  if (firstError) throw new Error(firstError);
  if (!isTailscaleFormDirty(document, values)) return document.content;

  const parsed = parseDocument(document.content);
  const proxy = locateProxy(parsed.contents!);
  for (const field of FORM_FIELDS) {
    if (document.initial[field] === values[field]) continue;
    setField(proxy, KEY_BY_FIELD[field], valueNode(field, values));
  }
  const output = presentDocument(parsed);
  try {
    assertImportable(output);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "无法生成有效的 Tailscale YAML");
  }
  return output;
}

/** Initial YAML for a node created through the form; the state directory is generated once. */
export function createTailscaleDraftContent(stateDir: string): string {
  return presentDocument({
    directives: [],
    contents: {
      kind: "mapping", tag: TAG_MAP, tagged: false, style: 1,
      items: [{
        key: stringNode("proxies"),
        value: {
          kind: "sequence", tag: TAG_SEQ, tagged: false, style: 1,
          items: [{
            kind: "mapping", tag: TAG_MAP, tagged: false, style: 1,
            items: [
              { key: stringNode("name"), value: stringNode("tailscale") },
              { key: stringNode("type"), value: stringNode("tailscale") },
              { key: stringNode("state-dir"), value: stringNode(stateDir) },
            ],
          }],
        },
      }],
    },
  });
}

function randomUuid(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // randomUUID needs a secure context; getRandomValues also works for plain-HTTP LAN deployments.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Collision-resistant client-relative directory for a new form-created node. */
export function createTailscaleStateDir(): string {
  return `tailscale/subboost-${randomUuid()}`;
}

/** Non-blocking check for obviously shared directories; it does not model client filesystems. */
export function hasDuplicateTailscaleStateDir(stateDir: string, otherStateDirs: readonly unknown[]): boolean {
  const key = tailscaleStateDirComparisonKey(stateDir);
  return otherStateDirs.some((other) => tailscaleStateDirComparisonKey(other) === key);
}
