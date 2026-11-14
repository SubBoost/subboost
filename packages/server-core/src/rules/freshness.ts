import type { RemoteRuleIndex } from "./types";

export type RuleListData = {
  lines: string[];
  bytes: number;
  fetchedAt: number;
  expiresAt: number;
};

export function discoveryFreshness(index: RemoteRuleIndex, lists: Iterable<RuleListData>, now: number) {
  let fetchedAt = index.fetchedAt;
  let expiresAt = index.expiresAt;
  for (const list of lists) {
    fetchedAt = Math.min(fetchedAt, list.fetchedAt);
    expiresAt = Math.min(expiresAt, list.expiresAt);
  }
  const source = index.source === "stale" || expiresAt <= now ? "stale" as const : "remote" as const;
  return { fetchedAt, expiresAt, source };
}
