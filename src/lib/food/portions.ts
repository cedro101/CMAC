import type { FoodPortion } from "../db";

// Your own portion weights, for foods where USDA's portion would be wrong.
// These take priority over USDA and are marked as estimates on the card.
const PORTION_DEFAULTS: { match: RegExp; label: string; grams: number }[] = [
  // USDA's cucumber is far bigger than a Lebanese one. Change the grams here
  // after weighing one of yours.
  { match: /\b(lebanese|persian|mini)\s+cucumbers?\b/i, label: "Lebanese cucumber", grams: 100 },
];

export function findPortionDefault(food: string) {
  return PORTION_DEFAULTS.find((portion) => portion.match.test(food)) ?? null;
}

// Picks a USDA portion by size word. Assumes medium when no size was given.
export function findUsdaPortion(portions: FoodPortion[], size?: string | null): FoodPortion | null {
  const word = (size ?? "medium").trim().toLowerCase();
  const pattern = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return portions.find((portion) => pattern.test(portion.label)) ?? null;
}
