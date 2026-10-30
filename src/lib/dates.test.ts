import { describe, expect, it } from "vitest";
import { dayKey } from "./dates";

describe("dayKey", () => {
  it("counts 3:59 am toward the previous day", () => {
    expect(dayKey(new Date(2026, 9, 15, 3, 59))).toBe("2026-10-14");
  });

  it("starts the new day at exactly 4:00 am", () => {
    expect(dayKey(new Date(2026, 9, 15, 4, 0))).toBe("2026-10-15");
  });

  it("counts 1:30 am toward the previous day", () => {
    expect(dayKey(new Date(2026, 9, 15, 1, 30))).toBe("2026-10-14");
  });

  it("keeps late evening on the same day", () => {
    expect(dayKey(new Date(2026, 9, 15, 23, 59))).toBe("2026-10-15");
  });

  it("rolls back across a month boundary", () => {
    expect(dayKey(new Date(2026, 10, 1, 2, 0))).toBe("2026-10-31");
  });

  it("rolls back across a year boundary", () => {
    expect(dayKey(new Date(2027, 0, 1, 2, 0))).toBe("2026-12-31");
  });

  it("handles leap day", () => {
    expect(dayKey(new Date(2028, 2, 1, 3, 0))).toBe("2028-02-29");
  });
});
