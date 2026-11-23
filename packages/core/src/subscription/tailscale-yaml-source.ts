import { COLLECTION_STYLE, SCALAR_STYLE, type MappingNode, type Node, type ScalarNode } from "js-yaml";
import { isValidTailscaleControlUrl, tailscaleStateDirComparisonKey } from "../mihomo/tailscale";
import { parseClashYaml } from "../parser/clash-yaml";
import { appendYamlSourceNode, readYamlSource, replaceYamlSourceNode, verifyYamlSourceNodesRewritable } from "./yaml-source-nodes";

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

export type TailscaleFormRead = { ok: true; values: TailscaleFormValues } | { ok: false; reason: string };

/** An existing node by its position in the source, with the values the form started from. */
export interface TailscaleNodeTarget {
  readonly index: number;
  readonly initial: TailscaleFormValues;
}

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

class IneligibleDocument extends Error {}

function ineligible(reason: string): never {
  throw new IneligibleDocument(reason);
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

/** Form values for a YAML node the form can represent without losing anything it shows. */
export function readTailscaleFormValues(node: Node): TailscaleFormRead {
  try {
    if (node.kind !== "mapping" || node.tag !== TAG_MAP) ineligible("代理必须是映射");
    return { ok: true, values: readForm(node) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "无法读取 Tailscale 节点" };
  }
}

export function isTailscaleFormDirty(initial: TailscaleFormValues, values: TailscaleFormValues): boolean {
  return FORM_FIELDS.some((field) => initial[field] !== values[field]);
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

function newProxyNode(values: TailscaleFormValues): MappingNode {
  const items: MappingNode["items"] = [
    { key: stringNode("name"), value: stringNode(values.name) },
    { key: stringNode("type"), value: stringNode("tailscale") },
  ];
  for (const field of FORM_FIELDS) {
    if (field === "name") continue;
    const value = valueNode(field, values);
    if (value) items.push({ key: stringNode(KEY_BY_FIELD[field]), value });
  }
  return { kind: "mapping", tag: TAG_MAP, tagged: false, style: COLLECTION_STYLE.BLOCK, items };
}

/**
 * Write a valid form into the YAML source: edit the node at `target`, or append a new node when it
 * is null. Untouched fields, unknown fields and every other part of the source keep their text; an
 * unchanged edit returns the original content.
 */
export function writeTailscaleNode(content: string, target: TailscaleNodeTarget | null, values: TailscaleFormValues): string {
  const firstError = Object.values(validateTailscaleForm(values))[0];
  if (firstError) throw new Error(firstError);
  if (target && !isTailscaleFormDirty(target.initial, values)) return content;

  const read = readYamlSource(content);
  if (!read.ok) throw new Error(read.reason);
  const { document } = read;
  if (document.entries.some((entry) => entry.index !== target?.index && entry.name === values.name)) {
    throw new Error("本 YAML 中已有同名节点");
  }

  let output: string;
  if (target) {
    const entry = document.entries[target.index];
    const current = entry ? readTailscaleFormValues(entry.node) : null;
    if (!current?.ok || isTailscaleFormDirty(current.values, target.initial)) {
      throw new Error("YAML 内容已变化，请返回后重新打开该节点");
    }
    const proxy = { ...(entry.node as MappingNode), items: [...(entry.node as MappingNode).items] };
    for (const field of FORM_FIELDS) {
      if (target.initial[field] !== values[field]) setField(proxy, KEY_BY_FIELD[field], valueNode(field, values));
    }
    output = replaceYamlSourceNode(document, target.index, proxy);
  } else {
    output = appendYamlSourceNode(document, newProxyNode(values));
  }

  const before = parseClashYaml(content);
  const after = parseClashYaml(output);
  if (
    after.errors.length > before.errors.length ||
    after.nodes.length !== before.nodes.length + (target ? 0 : 1) ||
    !after.nodes.some((node) => node.type === "tailscale")
  ) {
    throw new Error("导入器无法识别写入后的 Tailscale 节点");
  }
  return output;
}

/**
 * Checks whether a YAML source consists solely of valid, uniquely named Tailscale nodes that
 * can all be safely rewritten through `writeTailscaleNode`, returning their names and first index.
 */
export function inspectAutoEditableTailscaleYaml(
  content: string,
): { firstIndex: number; names: string[] } | null {
  if (!content.trim()) return null;
  const read = readYamlSource(content);
  if (!read.ok || read.document.replaceBlockedReason) return null;
  const { entries } = read.document;
  if (entries.length === 0) return null;

  const seenNames = new Set<string>();
  for (const entry of entries) {
    if (entry.type !== "tailscale") return null;
    const values = readTailscaleFormValues(entry.node);
    if (!values.ok || Object.keys(validateTailscaleForm(values.values)).length > 0) return null;
    if (seenNames.has(values.values.name)) return null;
    seenNames.add(values.values.name);
  }

  const rewritten = verifyYamlSourceNodesRewritable(read.document);
  if (rewritten === null) return null;

  const before = parseClashYaml(content);
  const after = parseClashYaml(rewritten);
  if (
    after.errors.length > before.errors.length ||
    after.nodes.length !== before.nodes.length ||
    before.nodes.length !== entries.length ||
    !after.nodes.every((node) => node.type === "tailscale")
  ) {
    return null;
  }

  return {
    firstIndex: entries[0].index,
    names: Array.from(seenNames),
  };
}

/** Values for a new node: a free name and a generated state directory. */
export function newTailscaleFormValues(takenNames: readonly string[], stateDir: string): TailscaleFormValues {
  let name = "tailscale";
  for (let suffix = 2; takenNames.includes(name); suffix++) name = `tailscale-${suffix}`;
  return {
    name, hostname: "", authKey: "", controlUrl: "", stateDir, exitNode: "",
    ephemeral: "default", udp: "default", acceptRoutes: "default", exitNodeAllowLanAccess: "default",
  };
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
