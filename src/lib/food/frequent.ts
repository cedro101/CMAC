import { db, type Entry, type FoodLookup, type Meal, type ProposalItem } from "../db";
import { hasMacros, historyLookup } from "./search";

export type FrequentFood = {
  ref: string;
  label: string;
  count: number;
  lookup: FoodLookup;
  lastGrams: number | null;
  lastMeal: Meal | null;
};

// The chips' foods: what's been logged most, with the most recent as a tiebreak.
export async function findFrequentFoods(limit: number): Promise<FrequentFood[]> {
  const entries = await db.entries.orderBy("timestamp").reverse().toArray();

  const groups = new Map<string, FrequentFood>();
  for (const entry of entries) {
    if (!hasMacros(entry)) continue;
    const lookup = historyLookup(entry);
    const group = groups.get(lookup.ref);
    if (group) {
      group.count += 1;
    } else {
      groups.set(lookup.ref, {
        ref: lookup.ref,
        label: entry.food,
        count: 1,
        lookup,
        lastGrams: entry.grams,
        lastMeal: entry.meal,
      });
    }
  }

  // Sorting is stable, so foods with equal counts stay most recent first.
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

// Copies past entries onto a new card exactly as they were logged.
export function entriesToCardItems(entries: Entry[]): ProposalItem[] {
  return entries.map((entry) => ({
    id: crypto.randomUUID(),
    food: entry.food,
    grams: entry.grams,
    rawOrCooked: entry.rawOrCooked,
    portion: entry.portion ?? null,
    source: "history",
    estimate: entry.estimate,
    kcal: entry.kcal,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
  }));
}
