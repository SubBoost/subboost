import { expect, it } from "vitest";
import { SourceImportOperationGuard } from "./source-import-operation";
import type { SubscriptionSource } from "./definitions";

it("invalidates imports across editor sessions even when source IDs and content match", () => {
  let revision = 1;
  const guard = new SourceImportOperationGuard(() => revision);
  const source: SubscriptionSource = { id: "same", type: "url", content: "https://local.subboost.test/sub" };
  const single = guard.startSingle(source);
  expect(guard.isSingleCurrent([source], single)).toBe(true);
  revision++;
  expect(guard.isSingleCurrent([source], single)).toBe(false);
  const batch = guard.startBatch([source]);
  expect(guard.isBatchCurrent([source], batch)).toBe(true);
  revision++;
  expect(guard.isBatchCurrent([source], batch)).toBe(false);
});
