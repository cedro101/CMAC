import { describe, expect, it } from "vitest";
import { dayKey, isValidDateKey, shiftDate } from "./dates";

describe("shiftDate", () => {
  it("moves across month and year boundaries", () => {
    expect(shiftDate("2026-11-01", -1)).toBe("2026-10-31");
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDate("2028-03-01", -1)).toBe("2028-02-29");
  });
});

describe("isValidDateKey", () => {
  it("accepts real dates only", () => {
    expect(isValidDateKey("2026-10-30")).toBe(true);
    expect(isValidDateKey("2026-02-31")).toBe(false);
    expect(isValidDateKey("30-10-2026")).toBe(false);
  });
});

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
