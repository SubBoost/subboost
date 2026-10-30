import { EVENT_ID, type Event } from "js-yaml";
import {
  MAX_YAML_DEPTH, MAX_YAML_EXPANDED_NODES, MAX_YAML_EXPANDED_TEXT, SubscriptionParseLimitError,
} from "./limits";

interface Cost { nodes: number; text: number; depth: number; open: boolean }

// parseEvents builds an array eagerly. Bound its potential size before invoking it.
export function checkYamlSyntaxBudget(source: string): void {
  let indicators = 0;
  for (let index = 0; index < source.length; index += 1) {
    if ("\n\r,:[]{}*&".includes(source[index]) && ++indicators > MAX_YAML_EXPANDED_NODES) {
      throw new SubscriptionParseLimitError("YAML 结构数量超过上限");
    }
  }
}

// Account for each alias as its fully expanded value, before object construction.
export function checkYamlExpansionBudget(source: string, events: Event[]): void {
  const anchors = new Map<string, Cost>();
  const stack: Cost[] = [];
  const add = (value: Cost) => {
    const parent = stack.at(-1);
    if (!parent) return;
    parent.nodes += value.nodes;
    parent.text += value.text;
    parent.depth = Math.max(parent.depth, value.depth + 1);
    if (parent.nodes > MAX_YAML_EXPANDED_NODES || parent.text > MAX_YAML_EXPANDED_TEXT || parent.depth > MAX_YAML_DEPTH) {
      throw new SubscriptionParseLimitError("YAML 展开后超过大小或深度上限");
    }
  };
  for (const event of events) {
    if (event.type === EVENT_ID.DOCUMENT) {
      anchors.clear();
      stack.push({ nodes: 0, text: 0, depth: 0, open: true });
    } else if (event.type === EVENT_ID.POP) {
      const value = stack.pop();
      if (value) { value.open = false; add(value); }
    } else if (event.type === EVENT_ID.ALIAS) {
      const value = anchors.get(source.slice(event.anchorStart, event.anchorEnd));
      if (value?.open) throw new SubscriptionParseLimitError("YAML 包含循环别名");
      if (value) add(value);
    } else {
      const isCollection = event.type === EVENT_ID.MAPPING || event.type === EVENT_ID.SEQUENCE;
      const length = event.type === EVENT_ID.SCALAR && event.valueStart >= 0
        ? event.valueEnd - event.valueStart : 0;
      // Escaping one UTF-16 code unit can take up to six output characters.
      const value: Cost = { nodes: 1, text: length * 6, depth: isCollection ? 1 : 0, open: isCollection };
      if (event.anchorStart >= 0) anchors.set(source.slice(event.anchorStart, event.anchorEnd), value);
      if (isCollection) stack.push(value);
      else add(value);
    }
  }
}
