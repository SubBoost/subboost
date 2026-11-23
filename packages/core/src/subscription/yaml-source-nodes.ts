import {
  COLLECTION_STYLE,
  EVENT_ID,
  SCALAR_STYLE,
  eventsToAst,
  parseEvents,
  present,
  type Document,
  type Event,
  type MappingNode,
  type Node,
} from "js-yaml";
import { MIHOMO_YAML_SCHEMA } from "../config/yaml-schema";
import { stableJsonStringify } from "../node-identity";
import { checkSubscriptionInput } from "../parser/limits";
import { loadSubscriptionYaml } from "../parser/yaml-scalars";
import { checkYamlSyntaxBudget } from "../parser/yaml-syntax-budget";

const TAG_STR = "tag:yaml.org,2002:str";
const TAG_MAP = "tag:yaml.org,2002:map";
const TAG_SEQ = "tag:yaml.org,2002:seq";
const TAG_NULL = "tag:yaml.org,2002:null";

/** One proxy entry of a YAML source, in source order. */
export interface YamlSourceEntry {
  readonly index: number;
  readonly name: string;
  readonly type: string;
  readonly node: Node;
}

export type YamlSourceLayout =
  | { kind: "empty" }
  | { kind: "config" } // a root mapping without proxies
  | { kind: "single" } // the root mapping is the proxy itself
  | { kind: "list"; inProxies: boolean; ranges: YamlItemRange[] | null; insert: YamlInsertion | null };

export interface YamlItemRange {
  start: number;
  end: number;
  indent: string;
}

export interface YamlInsertion {
  offset: number;
  indent: string;
}

/** A YAML source read for node-level editing. The text stays the persisted authority. */
export interface YamlSourceDocument {
  readonly content: string;
  readonly entries: readonly YamlSourceEntry[];
  /** Why entries cannot be rewritten in place, or null. */
  readonly replaceBlockedReason: string | null;
  /** Why a new entry cannot be appended, or null. */
  readonly appendBlockedReason: string | null;
  readonly layout: YamlSourceLayout;
  readonly root: Node | null;
  readonly eol: string;
}

export type YamlSourceReadResult = { ok: true; document: YamlSourceDocument } | { ok: false; reason: string };

class UnsupportedYaml extends Error {}

function unsupported(reason: string): never {
  throw new UnsupportedYaml(reason);
}

function scalarText(node: Node | undefined): string {
  return node?.kind === "scalar" && node.tag === TAG_STR ? node.value : "";
}

function findPairIndex(mapping: MappingNode, key: string): number {
  return mapping.items.findIndex((item) => item.key.kind === "scalar" && item.key.tag === TAG_STR && item.key.value === key);
}

/** Index just past the node that starts at `index`. */
function skipNode(events: Event[], index: number): number {
  const type = events[index].type;
  if (type !== EVENT_ID.MAPPING && type !== EVENT_ID.SEQUENCE) return index + 1;
  let depth = 0;
  for (let i = index; i < events.length; i++) {
    const event = events[i];
    if (event.type === EVENT_ID.MAPPING || event.type === EVENT_ID.SEQUENCE) depth++;
    else if (event.type === EVENT_ID.POP && --depth === 0) return i + 1;
  }
  return events.length;
}

function startOffset(event: Event | undefined): number {
  if (!event) return -1;
  if (event.type === EVENT_ID.MAPPING || event.type === EVENT_ID.SEQUENCE) return event.start;
  if (event.type === EVENT_ID.SCALAR) return event.valueStart;
  return -1;
}

function lineStart(content: string, offset: number): number {
  return content.lastIndexOf("\n", offset - 1) + 1;
}

/** The line holding an item's `-` indicator, which must be preceded by spaces only. */
function itemLine(content: string, itemStart: number): YamlItemRange {
  let dash = itemStart - 1;
  while (dash >= 0 && /\s/.test(content[dash])) dash--;
  if (dash < 0 || content[dash] !== "-") unsupported("无法定位列表项");
  const start = lineStart(content, dash);
  const indent = content.slice(start, dash);
  if (!/^ *$/.test(indent)) unsupported("列表项缩进无法识别");
  return { start, end: start, indent };
}

/** Leave trailing blank and comment-only lines outside the range; they usually introduce what follows. */
function trimTrailingTrivia(content: string, start: number, end: number): number {
  const segment = content.slice(start, end);
  const lines = segment.split("\n");
  const finalNewline = segment.endsWith("\n");
  if (finalNewline) lines.pop();
  let keep = lines.length;
  while (keep > 1 && /^\s*(#.*)?$/.test(lines[keep - 1])) keep--;
  const kept = lines.slice(0, keep).join("\n").length;
  return start + kept + (keep < lines.length || finalNewline ? 1 : 0);
}

/** Line ranges of block sequence items, plus where a new item goes. */
function blockItemRanges(content: string, events: Event[], seqIndex: number): { ranges: YamlItemRange[]; afterSeq: number } {
  const starts: number[] = [];
  let i = seqIndex + 1;
  while (events[i] && events[i].type !== EVENT_ID.POP) {
    const offset = startOffset(events[i]);
    if (offset < 0) unsupported("列表中有空项");
    starts.push(offset);
    i = skipNode(events, i);
  }
  const afterSeq = i + 1;
  const boundaryOffset = startOffset(events[afterSeq]);
  const boundary = boundaryOffset >= 0 ? lineStart(content, boundaryOffset) : content.length;
  const ranges = starts.map((offset) => itemLine(content, offset));
  ranges.forEach((range, index) => {
    const next = index + 1 < ranges.length ? ranges[index + 1].start : boundary;
    range.end = trimTrailingTrivia(content, range.start, next);
  });
  return { ranges, afterSeq };
}

function parseSingleDocument(content: string, events: Event[]): Document | null {
  for (const event of events) {
    if (event.type === EVENT_ID.ALIAS) unsupported("包含 YAML 别名");
    if ("anchorStart" in event && event.anchorStart >= 0) unsupported("包含 YAML 锚点");
    if ("tagStart" in event && event.tagStart >= 0) unsupported("包含显式 YAML 标签");
    if (event.type === EVENT_ID.DOCUMENT && (event.explicitStart || event.explicitEnd || event.directives.length > 0)) {
      unsupported("包含 YAML 文档标记");
    }
  }
  const documents = eventsToAst(events, { source: content, schema: MIHOMO_YAML_SCHEMA });
  if (documents.length > 1) unsupported("包含多个 YAML 文档");
  const root = documents[0]?.contents ?? null;
  return root && !(root.kind === "scalar" && root.tag === TAG_NULL) ? documents[0] : null;
}

function readLayout(content: string): { root: Node | null; layout: YamlSourceLayout; items: Node[] } {
  const events = parseEvents(content, {});
  const document = parseSingleDocument(content, events);
  if (!document) return { root: null, layout: { kind: "empty" }, items: [] };
  const root = document.contents!;
  // events[0] is the document; events[1] opens the root node.
  if (root.kind === "sequence") {
    if (root.tag !== TAG_SEQ) unsupported("无法识别的 YAML 结构");
    const block = root.style === COLLECTION_STYLE.BLOCK;
    const { ranges } = block ? blockItemRanges(content, events, 1) : { ranges: null };
    const last = ranges?.[ranges.length - 1];
    return {
      root,
      items: root.items,
      layout: { kind: "list", inProxies: false, ranges, insert: last ? { offset: last.end, indent: last.indent } : null },
    };
  }
  if (root.kind !== "mapping" || root.tag !== TAG_MAP) unsupported("无法识别的 YAML 结构");
  const proxiesIndex = findPairIndex(root, "proxies");
  if (proxiesIndex < 0) {
    return { root, items: findPairIndex(root, "type") >= 0 ? [root] : [], layout: { kind: findPairIndex(root, "type") >= 0 ? "single" : "config" } };
  }
  if (root.style !== COLLECTION_STYLE.BLOCK) unsupported("根节点使用了行内写法");

  // Walk the root mapping's pairs to the proxies value.
  let i = 2;
  for (let pair = 0; pair < proxiesIndex; pair++) i = skipNode(events, skipNode(events, i));
  const keyEvent = events[i];
  const valueIndex = skipNode(events, i);
  const value = root.items[proxiesIndex].value;

  if (value.kind === "scalar" && value.tag === TAG_NULL) {
    const explicit = startOffset(events[valueIndex]) >= 0;
    const keyEnd = keyEvent.type === EVENT_ID.SCALAR ? keyEvent.valueEnd : -1;
    const lineEnd = content.indexOf("\n", keyEnd);
    const insert = explicit ? null : { offset: lineEnd < 0 ? content.length : lineEnd + 1, indent: `${content.slice(lineStart(content, keyEnd), keyEnd).match(/^ */)![0]}  ` };
    return { root, items: [], layout: { kind: "list", inProxies: true, ranges: [], insert } };
  }
  if (value.kind !== "sequence" || value.tag !== TAG_SEQ) unsupported("proxies 不是列表");
  if (value.style !== COLLECTION_STYLE.BLOCK) {
    return { root, items: value.items, layout: { kind: "list", inProxies: true, ranges: null, insert: null } };
  }
  const { ranges } = blockItemRanges(content, events, valueIndex);
  const last = ranges[ranges.length - 1];
  return { root, items: value.items, layout: { kind: "list", inProxies: true, ranges, insert: last ? { offset: last.end, indent: last.indent } : null } };
}

/** Read a YAML source's proxies for node-level editing; unsupported layouts stay raw-only. */
export function readYamlSource(content: string): YamlSourceReadResult {
  try {
    checkSubscriptionInput(content);
    // parseEvents bypasses the subscription loader, so apply its syntax budget here.
    checkYamlSyntaxBudget(content);
    const { root, layout, items } = readLayout(content);
    const entries = items.map((node, index) => {
      const mapping = node.kind === "mapping" ? node : null;
      const field = (key: string) => (mapping ? scalarText(mapping.items[findPairIndex(mapping, key)]?.value) : "");
      return { index, name: field("name"), type: field("type").trim().toLowerCase(), node };
    });
    const inline = "proxies 使用了行内列表写法，请改成多行列表后再用表单";
    const replaceBlockedReason = layout.kind === "list" && !layout.ranges ? inline : null;
    const appendBlockedReason =
      layout.kind === "single" ? "此 YAML 只写了一个节点而没有 proxies 列表，请先改成 proxies 列表"
      : layout.kind === "list" && !layout.insert ? (layout.ranges ? "proxies 的值无法追加节点，请改成多行列表" : inline)
      : null;
    return {
      ok: true,
      document: { content, entries, replaceBlockedReason, appendBlockedReason, layout, root, eol: content.includes("\r\n") ? "\r\n" : "\n" },
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "YAML 无法解析" };
  }
}

function presentNodes(contents: Node): string {
  return present([{ directives: [], contents } as Document], { schema: MIHOMO_YAML_SCHEMA, lineWidth: -1 });
}

/** A single block list item, indented to sit among its siblings. */
function presentItem(node: Node, indent: string, eol: string): string {
  const text = presentNodes({ kind: "sequence", tag: TAG_SEQ, tagged: false, style: COLLECTION_STYLE.BLOCK, items: [node] });
  return `${text.replace(/\n$/, "").split("\n").map((line) => indent + line).join(eol)}${eol}`;
}

function loadItem(node: Node): unknown {
  return (loadSubscriptionYaml(presentItem(node, "", "\n")) as unknown[])[0];
}

function same(left: unknown, right: unknown): boolean {
  return stableJsonStringify(left) === stableJsonStringify(right);
}

/** The source's proxies as loaded values, in entry order. */
function loadedEntries(document: YamlSourceDocument): unknown[] {
  const { layout } = document;
  const value = loadSubscriptionYaml(document.content);
  if (layout.kind === "single") return [value];
  if (layout.kind !== "list") return [];
  const list = layout.inProxies ? (value as Record<string, unknown>).proxies : value;
  return Array.isArray(list) ? list : [];
}

/** Expected value of the whole source once the entry at `index` (or a new one) holds `item`. */
function expectedValue(document: YamlSourceDocument, index: number | null, item: unknown): unknown {
  const { layout } = document;
  if (layout.kind === "empty") return { proxies: [item] };
  if (layout.kind === "single") return item;
  const before = loadSubscriptionYaml(document.content) as Record<string, unknown> | unknown[];
  if (layout.kind === "config") return { ...(before as Record<string, unknown>), proxies: [item] };
  const list = [...loadedEntries(document)];
  if (index === null) list.push(item);
  else list[index] = item;
  return layout.inProxies ? { ...(before as Record<string, unknown>), proxies: list } : list;
}

function verified(document: YamlSourceDocument, index: number | null, node: Node, output: string): string {
  let written: unknown;
  try {
    written = loadSubscriptionYaml(output);
  } catch {
    written = undefined;
  }
  if (written === undefined || !same(written, expectedValue(document, index, loadItem(node)))) {
    throw new Error("无法在保留其余 YAML 的前提下写入，请直接编辑 YAML");
  }
  return output;
}

function quoteTrailingBlockScalar(node: Node): Node | null {
  if (node.kind === "scalar") {
    if (node.style !== SCALAR_STYLE.LITERAL_BLOCK && node.style !== SCALAR_STYLE.FOLDED_BLOCK) return null;
    return { ...node, style: SCALAR_STYLE.DOUBLE_QUOTED };
  }
  if (node.kind === "mapping" && node.style === COLLECTION_STYLE.BLOCK && node.items.length > 0) {
    const last = node.items[node.items.length - 1];
    const nextValue = quoteTrailingBlockScalar(last.value);
    if (!nextValue) return null;
    const items = [...node.items];
    items[items.length - 1] = { key: last.key, value: nextValue };
    return { ...node, items };
  }
  if (node.kind === "sequence" && node.style === COLLECTION_STYLE.BLOCK && node.items.length > 0) {
    const nextItem = quoteTrailingBlockScalar(node.items[node.items.length - 1]);
    if (!nextItem) return null;
    const items = [...node.items];
    items[items.length - 1] = nextItem;
    return { ...node, items };
  }
  return null;
}

function spliceListItem(content: string, range: YamlItemRange, node: Node, eol: string): string {
  let text = presentItem(node, range.indent, eol);
  if (!content.slice(range.start, range.end).endsWith("\n")) text = text.slice(0, -eol.length);
  return content.slice(0, range.start) + text + content.slice(range.end);
}

function rangeMatchesEntry(slice: string, entryValue: unknown): boolean {
  try {
    return same(loadSubscriptionYaml(slice), [entryValue]);
  } catch {
    return false;
  }
}

/** Rewrite one entry in place; every other byte of the source stays as written. */
export function replaceYamlSourceNode(document: YamlSourceDocument, index: number, node: MappingNode): string {
  const { content, layout, eol } = document;
  if (document.replaceBlockedReason) throw new Error(document.replaceBlockedReason);
  const original = document.entries[index]?.node;
  if (!original) throw new Error("找不到要修改的节点");
  const originalLoaded = loadedEntries(document)[index];
  // An entry the presenter cannot reproduce would change fields nobody edited.
  if (!same(loadItem(original), originalLoaded)) throw new Error("该节点的写法无法无损改写，请直接编辑 YAML");

  if (layout.kind === "single") return verified(document, index, node, presentNodes(node));
  if (layout.kind !== "list" || !layout.ranges) throw new Error("找不到要修改的节点");
  const range = layout.ranges[index];
  const primary = spliceListItem(content, range, node, eol);
  try {
    return verified(document, index, node, primary);
  } catch (error) {
    // Clearing a trailing field can expose an earlier block scalar right above an indented trailing
    // comment; double-quoting that block scalar keeps the comment outside the scalar only when the
    // replaced range itself contained the whole original entry.
    const slice = content.slice(range.start, range.end);
    const quoted = rangeMatchesEntry(slice, originalLoaded) ? quoteTrailingBlockScalar(node) : null;
    if (quoted) return verified(document, index, node, spliceListItem(content, range, quoted, eol));
    throw error;
  }
}

/**
 * Re-present every entry in place without changing its fields, verifying that the full document
 * loads cleanly, each entry and its source range round-trip losslessly, and the spliced YAML keeps
 * exact semantics. Returns the rewritten YAML on success, or null when rewriting is unsafe.
 */
export function verifyYamlSourceNodesRewritable(document: YamlSourceDocument): string | null {
  const { content, entries, layout, eol } = document;
  if (document.replaceBlockedReason || entries.length === 0) return null;

  let loadedRoot: unknown;
  try {
    loadedRoot = loadSubscriptionYaml(content);
  } catch {
    return null;
  }

  const loadedList =
    layout.kind === "single"
      ? [loadedRoot]
      : layout.kind === "list"
        ? (layout.inProxies ? (loadedRoot as Record<string, unknown>).proxies : loadedRoot)
        : null;
  if (!Array.isArray(loadedList) || loadedList.length !== entries.length) return null;

  for (let index = 0; index < entries.length; index += 1) {
    try {
      if (!same(loadItem(entries[index].node), loadedList[index])) return null;
    } catch {
      return null;
    }
  }

  let output: string;
  if (layout.kind === "single") {
    output = presentNodes(entries[0].node);
  } else if (layout.kind === "list" && layout.ranges && layout.ranges.length === entries.length) {
    let cursor = 0;
    const parts: string[] = [];
    for (let index = 0; index < entries.length; index += 1) {
      const range = layout.ranges[index];
      const slice = content.slice(range.start, range.end);
      if (!rangeMatchesEntry(slice, loadedList[index])) return null;
      let text = presentItem(entries[index].node, range.indent, eol);
      if (!slice.endsWith("\n")) text = text.slice(0, -eol.length);
      parts.push(content.slice(cursor, range.start), text);
      cursor = range.end;
    }
    parts.push(content.slice(cursor));
    output = parts.join("");
  } else {
    return null;
  }

  try {
    const written = loadSubscriptionYaml(output);
    return written !== undefined && same(written, loadedRoot) ? output : null;
  } catch {
    return null;
  }
}

/** Append a new entry after the last one, creating the proxies list when there is none. */
export function appendYamlSourceNode(document: YamlSourceDocument, node: MappingNode): string {
  const { content, layout, eol } = document;
  if (document.appendBlockedReason) throw new Error(document.appendBlockedReason);
  if (layout.kind === "list" && layout.insert) {
    const { offset, indent } = layout.insert;
    const lead = offset > 0 && content[offset - 1] !== "\n" ? eol : "";
    return verified(document, null, node, content.slice(0, offset) + lead + presentItem(node, indent, eol) + content.slice(offset));
  }
  // Keep the text verbatim, trailing blanks included: they may belong to a block scalar.
  const head = !content || content.endsWith("\n") ? content : content + eol;
  return verified(document, null, node, `${head}proxies:${eol}${presentItem(node, "  ", eol)}`);
}
