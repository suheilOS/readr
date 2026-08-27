import { describe, expect, it } from "vitest";
import {
  isMediaProgress,
  parseSaveMediaProgressInput,
} from "../../shared/mediaProgress";

const REVISION = "1756339200000-00000000000000000000000000000001-0000000001";

describe("media progress contract", () => {
  it("uses the same numeric invariants for writes and persisted responses", () => {
    const invalidValues = {
      positionSeconds: 301,
      durationSeconds: 300,
      revision: REVISION,
    };
    expect(parseSaveMediaProgressInput(invalidValues)).toBeNull();
    expect(isMediaProgress({
      ...invalidValues,
      updatedAt: "2026-08-28T00:00:00.000Z",
    })).toBe(false);
  });

  it("accepts a bounded position with a sortable revision", () => {
    const values = {
      positionSeconds: 120,
      durationSeconds: 300,
      revision: REVISION,
    };
    expect(parseSaveMediaProgressInput(values)).toEqual(values);
    expect(isMediaProgress({
      ...values,
      updatedAt: "2026-08-28T00:00:00.000Z",
    })).toBe(true);
  });
});
