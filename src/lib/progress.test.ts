import { describe, expect, it } from "vitest";
import { formatShortDate, weekStart } from "./dates";
import type { Day, Entry } from "./db";
import { computeTrend, fillDates, rangeStart, summarizeDays, summarizeWeeks } from "./progress";

function entry(date: string, overrides: Partial<Entry> = {}): Entry {
  return {
    id: crypto.randomUUID(),
    date,
    food: "Food",
    grams: 100,
    rawOrCooked: null,
    kcal: 500,
    protein: 40,
    carbs: 50,
    fat: 10,
    meal: null,
    estimate: false,
    source: "imported",
    timestamp: 1,
    ...overrides,
  };
}

const weight = (date: string, weightKg: number | null, incomplete = false): Day => ({ date, weightKg, incomplete });

describe("computeTrend", () => {
  it("averages the weights in the last 7 calendar days", () => {
    const days = ["01", "02", "03", "04", "05", "06", "07", "08"].map((day, index) =>
      weight(`2026-10-${day}`, 90 + index),
    );
    const trend = computeTrend(days);
    expect(trend.get("2026-10-01")).toBe(90);
    expect(trend.get("2026-10-02")).toBe(90.5);
    expect(trend.get("2026-10-07")).toBe(93);
    expect(trend.get("2026-10-08")).toBe(94); // The 1st has dropped out.
  });

  it("handles missed days and ignores days with no weight", () => {
    const trend = computeTrend([weight("2026-10-01", 90), weight("2026-10-02", null), weight("2026-10-06", 92)]);
    expect(trend.get("2026-10-06")).toBe(91);
    expect(trend.has("2026-10-02")).toBe(false);
  });

  it("smooths the 1 to 2 kg day-to-day swings", () => {
    const swings = [93, 95, 93, 95, 93, 95, 93].map((kg, index) => weight(`2026-10-0${index + 1}`, kg));
    expect(computeTrend(swings).get("2026-10-07")).toBeCloseTo(93.86, 2);
  });
});

describe("summarizeDays", () => {
  it("totals a day and marks missing macros as partial", () => {
    const [day] = summarizeDays([entry("2026-10-01"), entry("2026-10-01", { kcal: null })], []);
    expect(day).toMatchObject({ kcal: 500, kcalPartial: true, protein: 80, proteinPartial: false, entryCount: 2 });
  });

  it("marks a day as estimate heavy when over half its calories are estimated", () => {
    const [heavy] = summarizeDays([entry("2026-10-01", { kcal: 700, estimate: true }), entry("2026-10-01", { kcal: 300 })], []);
    expect(heavy).toMatchObject({ estimateShare: 0.7, estimateHeavy: true });
    const [half] = summarizeDays([entry("2026-10-01", { estimate: true }), entry("2026-10-01")], []);
    expect(half.estimateHeavy).toBe(false);
  });

  it("includes a weight-only day and keeps dates in order", () => {
    const days = summarizeDays([entry("2026-10-03")], [weight("2026-10-01", 93)]);
    expect(days.map((day) => day.date)).toEqual(["2026-10-01", "2026-10-03"]);
    expect(days[0]).toMatchObject({ kcal: null, weightKg: 93, trendKg: 93, entryCount: 0 });
  });

  it("doesn't divide by zero on a day with no calories known", () => {
    const [day] = summarizeDays([entry("2026-10-01", { kcal: null })], []);
    expect(day).toMatchObject({ kcal: null, estimateShare: 0, estimateHeavy: false });
  });
});

describe("ranges", () => {
  it("starts each range the right number of days back", () => {
    expect(rangeStart("2w", "2026-10-30")).toBe("2026-10-17");
    expect(rangeStart("1m", "2026-10-30")).toBe("2026-10-01");
    expect(rangeStart("all", "2026-10-30")).toBeNull();
  });

  it("fills gaps so the chart's axis stays even", () => {
    const summaries = summarizeDays([entry("2026-10-01"), entry("2026-10-03")], []);
    const filled = fillDates(summaries, null, "2026-10-04");
    expect(filled.map((day) => day.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(filled[1].kcal).toBeUndefined();
  });

  it("returns nothing with no data", () => {
    expect(fillDates([], null, "2026-10-04")).toEqual([]);
  });
});

describe("summarizeWeeks", () => {
  // 2026-10-05 and 2026-10-12 are Mondays.
  it("groups by Monday-start weeks, newest first", () => {
    expect(weekStart("2026-10-11")).toBe("2026-10-05");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
    const weeks = summarizeWeeks(summarizeDays([entry("2026-10-06"), entry("2026-10-13")], []), "2026-10-20");
    expect(weeks.map((week) => week.weekStart)).toEqual(["2026-10-12", "2026-10-05"]);
  });

  it("leaves today, incomplete days and days missing calories out of the averages", () => {
    const entries = [
      entry("2026-10-05", { kcal: 2000, protein: 150 }),
      entry("2026-10-06", { kcal: 100 }),
      entry("2026-10-07", { kcal: null }),
      entry("2026-10-08", { kcal: 300 }),
    ];
    const summaries = summarizeDays(entries, [weight("2026-10-06", null, true)]);
    const [week] = summarizeWeeks(summaries, "2026-10-08");
    expect(week).toMatchObject({ daysCounted: 1, avgKcal: 2000, avgProtein: 150 });
  });

  it("reports the change in trend weight from the previous week", () => {
    const days = [weight("2026-10-06", 94), weight("2026-10-12", 92)];
    const [latest, first] = summarizeWeeks(summarizeDays([], days), "2026-10-20");
    expect(first.trendChangeKg).toBeNull();
    expect(latest.trendChangeKg).toBe(-1); // The trend went from 94 to 93.
  });

  it("gives no averages for a week with nothing to count", () => {
    const [week] = summarizeWeeks(summarizeDays([], [weight("2026-10-05", 94)]), "2026-10-20");
    expect(week).toMatchObject({ daysCounted: 0, avgKcal: null, avgProtein: null });
  });
});

describe("formatShortDate", () => {
  it("formats a date for chart axes", () => {
    expect(formatShortDate("2026-10-03")).toContain("3");
  });
});
