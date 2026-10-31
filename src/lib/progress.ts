import { shiftDate, weekStart } from "./dates";
import type { Day, Entry } from "./db";
import { sumMacros } from "./macros";

export type RangeKey = "2w" | "1m" | "3m" | "all";

const RANGE_DAYS: Record<Exclude<RangeKey, "all">, number> = { "2w": 14, "1m": 30, "3m": 90 };
const TREND_WINDOW_DAYS = 7;
const ESTIMATE_HEAVY_SHARE = 0.5;

export type DaySummary = {
  date: string;
  kcal: number | null;
  protein: number | null;
  kcalPartial: boolean;
  proteinPartial: boolean;
  estimateShare: number;
  estimateHeavy: boolean;
  entryCount: number;
  weightKg: number | null;
  trendKg: number | null;
  incomplete: boolean;
};

export function rangeStart(range: RangeKey, today: string): string | null {
  return range === "all" ? null : shiftDate(today, -(RANGE_DAYS[range] - 1));
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// The trend for a date is the average of the weights in the 7 calendar days
// ending on it. Missed days just leave fewer weights in the average.
export function computeTrend(days: Day[]): Map<string, number> {
  const weighed = days.filter((day) => day.weightKg !== null);
  const trend = new Map<string, number>();
  for (const day of weighed) {
    const start = shiftDate(day.date, -(TREND_WINDOW_DAYS - 1));
    const inWindow = weighed.filter((other) => other.date >= start && other.date <= day.date);
    const total = inWindow.reduce((sum, other) => sum + (other.weightKg as number), 0);
    trend.set(day.date, round(total / inWindow.length, 2));
  }
  return trend;
}

// One summary per date that has any food or weight, oldest first.
export function summarizeDays(entries: Entry[], days: Day[]): DaySummary[] {
  const trend = computeTrend(days);
  const entriesByDate = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = entriesByDate.get(entry.date);
    if (list) list.push(entry);
    else entriesByDate.set(entry.date, [entry]);
  }
  const daysByDate = new Map(days.map((day) => [day.date, day]));
  const dates = [...new Set([...entriesByDate.keys(), ...days.filter((day) => day.weightKg !== null || day.incomplete).map((day) => day.date)])].sort();

  return dates.map((date) => {
    const dayEntries = entriesByDate.get(date) ?? [];
    const totals = sumMacros(dayEntries);
    const knownKcal = dayEntries.some((entry) => entry.kcal !== null);
    const knownProtein = dayEntries.some((entry) => entry.protein !== null);
    const estimatedKcal = dayEntries.reduce((sum, entry) => sum + (entry.estimate ? (entry.kcal ?? 0) : 0), 0);
    const estimateShare = knownKcal && totals.kcal.value > 0 ? estimatedKcal / totals.kcal.value : 0;
    const record = daysByDate.get(date);
    return {
      date,
      kcal: knownKcal ? totals.kcal.value : null,
      protein: knownProtein ? totals.protein.value : null,
      kcalPartial: totals.kcal.partial,
      proteinPartial: totals.protein.partial,
      estimateShare,
      estimateHeavy: estimateShare > ESTIMATE_HEAVY_SHARE,
      entryCount: dayEntries.length,
      weightKg: record?.weightKg ?? null,
      trendKg: trend.get(date) ?? null,
      incomplete: record?.incomplete ?? false,
    };
  });
}

// Every date in a range, including days with no data, for an even chart axis.
export function fillDates(summaries: DaySummary[], start: string | null, end: string): (Partial<DaySummary> & { date: string })[] {
  const first = start ?? summaries[0]?.date;
  if (!first) return [];
  const byDate = new Map(summaries.map((summary) => [summary.date, summary]));
  const filled: (Partial<DaySummary> & { date: string })[] = [];
  for (let date = first; date <= end; date = shiftDate(date, 1)) {
    filled.push(byDate.get(date) ?? { date });
  }
  return filled;
}

export type WeekSummary = {
  weekStart: string;
  daysCounted: number;
  avgKcal: number | null;
  avgProtein: number | null;
  trendChangeKg: number | null;
};

// Newest week first. Today, incomplete days and days missing calories are left
// out of the averages, because they'd pull them down.
export function summarizeWeeks(summaries: DaySummary[], today: string): WeekSummary[] {
  const weeks = new Map<string, DaySummary[]>();
  for (const summary of summaries) {
    const start = weekStart(summary.date);
    const list = weeks.get(start);
    if (list) list.push(summary);
    else weeks.set(start, [summary]);
  }

  const ordered = [...weeks.keys()].sort();
  const lastTrend = (list: DaySummary[]) => list.findLast((day) => day.trendKg !== null)?.trendKg ?? null;

  return ordered
    .map((start, index): WeekSummary => {
      const list = weeks.get(start) as DaySummary[];
      const counted = list.filter(
        (day) => day.date !== today && day.kcal !== null && !day.kcalPartial && !day.incomplete,
      );
      const withProtein = counted.filter((day) => day.protein !== null && !day.proteinPartial);
      const average = (values: number[]) =>
        values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
      const avgKcal = average(counted.map((day) => day.kcal as number));
      const avgProtein = average(withProtein.map((day) => day.protein as number));

      const end = lastTrend(list);
      const previous = index > 0 ? lastTrend(weeks.get(ordered[index - 1]) as DaySummary[]) : null;

      return {
        weekStart: start,
        daysCounted: counted.length,
        avgKcal: avgKcal === null ? null : Math.round(avgKcal),
        avgProtein: avgProtein === null ? null : Math.round(avgProtein),
        trendChangeKg: end !== null && previous !== null ? round(end - previous, 2) : null,
      };
    })
    .reverse();
}
