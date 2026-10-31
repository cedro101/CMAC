import { shiftDate } from "./dates";
import type { Day, Entry } from "./db";
import { computeTrend, summarizeDays } from "./progress";

export const USER_PROFILE = {
  age: 30,
  sex: "male",
  heightCm: 180,
  build: "muscular",
  activity: "moderate",
} as const;

const KCAL_PER_KG = 7700;
const WINDOW_DAYS = 28;
const MIN_DAYS = 14;
const MIN_TREND_SPAN_DAYS = 10;

// How much restaurant estimates could be off by, for the skew figure.
const ESTIMATE_ERROR_SHARE = 0.3;

// This activity level sits around these standard multipliers. Formulas tend to
// run low for muscular people, so the top of the range is the likelier end.
const ACTIVITY_LOW = 1.55;
const ACTIVITY_HIGH = 1.75;

function roundTo50(value: number): number {
  return Math.round(value / 50) * 50;
}

export type HistoryEstimate =
  | { available: false; reason: string; daysUsed: number }
  | {
      available: true;
      maintenanceKcal: number;
      daysUsed: number;
      daysExcluded: number;
      avgIntakeKcal: number;
      trendChangeKg: number;
      trendSpanDays: number;
      confidence: "low" | "medium" | "high";
      estimatedKcalShare: number;
      estimateSkewKcal: number; // Roughly plus or minus this per day, from restaurant estimates.
    };

// Average intake, adjusted by how fast the trend weight moved at 7700 kcal per
// kg. Eating at maintenance would hold the trend flat.
export function estimateFromHistory(entries: Entry[], days: Day[], today: string): HistoryEstimate {
  const start = shiftDate(today, -WINDOW_DAYS);
  const inWindow = (date: string) => date >= start && date < today;

  const summaries = summarizeDays(entries, days).filter((day) => inWindow(day.date));
  const counted = summaries.filter((day) => day.kcal !== null && !day.kcalPartial && !day.incomplete);
  if (counted.length < MIN_DAYS) {
    return {
      available: false,
      reason: `Only ${counted.length} complete days in the last ${WINDOW_DAYS}, and at least ${MIN_DAYS} are needed.`,
      daysUsed: counted.length,
    };
  }

  const trend = computeTrend(days);
  const trendDates = [...trend.keys()].filter(inWindow).sort();
  const firstDate = trendDates[0];
  const lastDate = trendDates.at(-1);
  const trendSpanDays = firstDate && lastDate ? Math.round((Date.parse(lastDate) - Date.parse(firstDate)) / 86400000) : 0;
  if (trendSpanDays < MIN_TREND_SPAN_DAYS) {
    return {
      available: false,
      reason: `Weigh-ins only cover ${trendSpanDays} days of the last ${WINDOW_DAYS}, and at least ${MIN_TREND_SPAN_DAYS} are needed.`,
      daysUsed: counted.length,
    };
  }

  const totalKcal = counted.reduce((sum, day) => sum + (day.kcal as number), 0);
  const avgIntakeKcal = totalKcal / counted.length;
  const estimatedKcal = counted.reduce((sum, day) => sum + (day.kcal as number) * day.estimateShare, 0);
  const estimatedKcalShare = totalKcal > 0 ? estimatedKcal / totalKcal : 0;

  const trendChangeKg = (trend.get(lastDate as string) as number) - (trend.get(firstDate as string) as number);
  const dailySurplus = (trendChangeKg * KCAL_PER_KG) / trendSpanDays;

  const confidence =
    counted.length >= 21 && estimatedKcalShare < 0.25
      ? "high"
      : counted.length >= MIN_DAYS && estimatedKcalShare < 0.5
        ? "medium"
        : "low";

  return {
    available: true,
    maintenanceKcal: roundTo50(avgIntakeKcal - dailySurplus),
    daysUsed: counted.length,
    daysExcluded: summaries.length - counted.length,
    avgIntakeKcal: Math.round(avgIntakeKcal),
    trendChangeKg: Math.round(trendChangeKg * 100) / 100,
    trendSpanDays,
    confidence,
    estimatedKcalShare: Math.round(estimatedKcalShare * 100) / 100,
    estimateSkewKcal: roundTo50((estimatedKcal / counted.length) * ESTIMATE_ERROR_SHARE),
  };
}

export type BodyEstimate =
  | { available: false; reason: string }
  | { available: true; weightKgUsed: number; restingKcal: number; lowKcal: number; highKcal: number };

// The Mifflin-St Jeor formula, using the current trend weight so it stays up to
// date as weight changes.
export function estimateFromBody(days: Day[]): BodyEstimate {
  const latest = [...computeTrend(days).entries()].sort(([a], [b]) => a.localeCompare(b)).at(-1);
  if (!latest) return { available: false, reason: "No weigh-ins logged yet." };

  const weightKg = latest[1];
  const restingKcal = 10 * weightKg + 6.25 * USER_PROFILE.heightCm - 5 * USER_PROFILE.age + 5;
  return {
    available: true,
    weightKgUsed: weightKg,
    restingKcal: Math.round(restingKcal),
    lowKcal: roundTo50(restingKcal * ACTIVITY_LOW),
    highKcal: roundTo50(restingKcal * ACTIVITY_HIGH),
  };
}
