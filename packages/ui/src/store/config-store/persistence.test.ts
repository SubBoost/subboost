import { describe, expect, it } from "vitest";
import { initialState } from "./definitions";
import { normalizePersistedConfigState, partializeConfigState } from "./persistence";

describe("config store persistence", () => {
  it("round-trips optional global url-test overrides", () => {
    const state = {
      ...structuredClone(initialState),
      urlTestLazy: true,
      urlTestTolerance: 50,
    } as any;

    const persisted = partializeConfigState(state);

    expect(persisted).toMatchObject({ urlTestLazy: true, urlTestTolerance: 50 });
    expect(normalizePersistedConfigState(persisted)).toMatchObject({
      urlTestLazy: true,
      urlTestTolerance: 50,
    });
  });

  it("drops malformed url-test overrides", () => {
    const normalized = normalizePersistedConfigState({
      urlTestLazy: "yes",
      urlTestTolerance: -1,
    });

    expect(normalized).not.toHaveProperty("urlTestLazy");
    expect(normalized).not.toHaveProperty("urlTestTolerance");
  });
});
