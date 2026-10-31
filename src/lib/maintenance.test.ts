import { describe, expect, it } from "vitest";
import { shiftDate } from "./dates";
import type { Day, Entry } from "./db";
import { estimateFromBody, estimateFromHistory } from "./maintenance";

const TODAY = "2026-10-30";

function entry(date: string, kcal: number | null, estimate = false): Entry {
  return {
    id: crypto.randomUUID(),
    date,
    food: "Food",
    grams: null,
    rawOrCooked: null,
    kcal,
    protein: 100,
    carbs: 100,
    fat: 50,
    meal: null,
    estimate,
    source: "imported",
    timestamp: 1,
  };
}

// A run of days ending yesterday, with weight changing steadily.
function build(count: number, kcal: number, kgPerDay: number, estimate = false) {
  const entries: Entry[] = [];
  const days: Day[] = [];
  for (let back = count; back >= 1; back--) {
    const date = shiftDate(TODAY, -back);
    entries.push(entry(date, kcal, estimate));
    days.push({ date, weightKg: 93 - back * kgPerDay, incomplete: false });
  }
  return { entries, days };
}

describe("estimateFromHistory", () => {
  it("equals intake when the trend weight is flat", () => {
    const { entries, days } = build(28, 3000, 0);
    expect(estimateFromHistory(entries, days, TODAY)).toMatchObject({
      available: true,
      maintenanceKcal: 3000,
      avgIntakeKcal: 3000,
      daysUsed: 28,
      trendChangeKg: 0,
    });
  });

  it("adds the deficit back when losing weight, at 7700 kcal per kg", () => {
    // Losing 0.1 kg a day is a 770 kcal daily deficit, or a little less through
    // the trend line, which smooths the first few days.
    const losing = build(28, 2500, -0.1);
    const lost = estimateFromHistory(losing.entries, losing.days, TODAY);
    if (!lost.available) throw new Error(lost.reason);
    expect(lost.trendChangeKg).toBeLessThan(0);
    expect(lost.maintenanceKcal).toBeGreaterThan(3100);
    expect(lost.maintenanceKcal).toBeLessThan(3300);
  });

  it("takes the surplus off when gaining weight", () => {
    const gaining = build(28, 3500, 0.1);
    const gained = estimateFromHistory(gaining.entries, gaining.days, TODAY);
    if (!gained.available) throw new Error(gained.reason);
    expect(gained.trendChangeKg).toBeGreaterThan(0);
    expect(gained.maintenanceKcal).toBeLessThan(3500);
  });

  it("excludes today, incomplete days and days missing calories", () => {
    const { entries, days } = build(20, 3000, 0);
    entries.push(entry(TODAY, 100));
    entries.push(entry(shiftDate(TODAY, -1), null)); // Yesterday is now missing a value.
    days[0].incomplete = true;
    const result = estimateFromHistory(entries, days, TODAY);
    expect(result).toMatchObject({ available: true, daysUsed: 18, daysExcluded: 2, avgIntakeKcal: 3000 });
  });

  it("ignores days older than 4 weeks", () => {
    const { entries, days } = build(28, 3000, 0);
    entries.push(entry(shiftDate(TODAY, -60), 9000));
    expect(estimateFromHistory(entries, days, TODAY)).toMatchObject({ avgIntakeKcal: 3000 });
  });

  it("refuses with too few complete days", () => {
    const { entries, days } = build(13, 3000, 0);
    expect(estimateFromHistory(entries, days, TODAY)).toMatchObject({ available: false, daysUsed: 13 });
  });

  it("refuses when weigh-ins cover too little time", () => {
    const { entries } = build(20, 3000, 0);
    const days = [{ date: shiftDate(TODAY, -3), weightKg: 93, incomplete: false }];
    expect(estimateFromHistory(entries, days, TODAY)).toMatchObject({ available: false });
  });

  it("lowers confidence and reports the skew when most calories are estimates", () => {
    const { entries, days } = build(28, 3000, 0, true);
    expect(estimateFromHistory(entries, days, TODAY)).toMatchObject({
      confidence: "low",
      estimatedKcalShare: 1,
      estimateSkewKcal: 900,
    });
  });

  it("has high confidence with plenty of measured days", () => {
    const { entries, days } = build(28, 3000, 0);
    expect(estimateFromHistory(entries, days, TODAY)).toMatchObject({ confidence: "high", estimateSkewKcal: 0 });
  });
});

describe("estimateFromBody", () => {
  it("uses the formula with the current trend weight", () => {
    const days = [{ date: "2026-10-29", weightKg: 93, incomplete: false }];
    expect(estimateFromBody(days)).toEqual({
      available: true,
      weightKgUsed: 93,
      restingKcal: 2009,
      lowKcal: 3100,
      highKcal: 3500,
    });
  });

  it("needs at least one weigh-in", () => {
    expect(estimateFromBody([]).available).toBe(false);
  });
});
