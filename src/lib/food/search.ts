import { db, type Entry, type FoodLookup, type FoodPortion, type Macros } from "../db";
import { multiplyMacros } from "../macros";
import { inferUsdaState } from "./rawCooked";
import type { UsdaFood } from "./usdaParse";

const MAX_LOCAL_RESULTS = 5;
const MAX_USDA_RESULTS = 6;
const MAX_PORTIONS_SHOWN = 6;

// Words that say nothing about which food it is.
const IGNORED_WORDS = new Set(["a", "an", "the", "of", "with", "and", "my", "raw", "cooked", "weight", "g"]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word && !IGNORED_WORDS.has(word))
    .map((word) => word.replace(/oes$/, "o").replace(/ies$/, "y").replace(/([^s])s$/, "$1"));
}

function matches(queryWords: string[], name: string): boolean {
  const nameWords = new Set(tokenize(name));
  return queryWords.length > 0 && queryWords.every((word) => nameWords.has(word));
}

export function hasMacros(macros: Macros): boolean {
  return macros.kcal !== null || macros.protein !== null || macros.carbs !== null || macros.fat !== null;
}

export function historyLookup(entry: Entry): FoodLookup {
  const weighed = entry.grams !== null && entry.grams > 0;
  return {
    ref: `history:${tokenize(entry.food).join("-")}|${entry.rawOrCooked ?? ""}`,
    name: entry.food,
    source: "history",
    per100g: weighed ? multiplyMacros(entry, 100 / (entry.grams as number)) : null,
    perPortion: weighed ? null : pickMacros(entry),
    rawOrCooked: entry.rawOrCooked,
    estimate: entry.estimate,
    portions: [],
    createdAt: Date.now(),
  };
}

function pickMacros({ kcal, protein, carbs, fat }: Macros): Macros {
  return { kcal, protein, carbs, fat };
}

// The lookup for repeating one exact past entry, such as "same as yesterday".
export function entryLookup(entry: Entry): FoodLookup {
  return {
    ...historyLookup(entry),
    ref: `entry:${entry.id}`,
    perPortion: pickMacros(entry),
    defaultGrams: entry.grams,
  };
}

async function searchSavedFoods(words: string[]): Promise<FoodLookup[]> {
  const foods = await db.customFoods.filter((food) => matches(words, food.name)).toArray();
  return foods.slice(0, MAX_LOCAL_RESULTS).map((food) => {
    const portions: FoodPortion[] = food.servingG ? [{ label: "serving", grams: food.servingG }] : [];
    return {
      ref: `saved:${food.id}`,
      name: food.name,
      source: "saved" as const,
      per100g: food.per100g,
      perPortion: null,
      rawOrCooked: null,
      estimate: false,
      portions,
      createdAt: Date.now(),
    };
  });
}

async function searchHistory(words: string[]) {
  const entries = await db.entries
    .orderBy("timestamp")
    .reverse()
    .filter((entry) => matches(words, entry.food))
    .toArray();

  const groups = new Map<string, { lookup: FoodLookup; timesLogged: number; lastLogged: string }>();
  for (const entry of entries) {
    const lookup = historyLookup(entry);
    const group = groups.get(lookup.ref);
    if (group) group.timesLogged += 1;
    else if (hasMacros(entry)) groups.set(lookup.ref, { lookup, timesLogged: 1, lastLogged: entry.date });
  }
  return [...groups.values()].slice(0, MAX_LOCAL_RESULTS);
}

function usdaLookup(food: UsdaFood): FoodLookup {
  return {
    ref: `usda:${food.fdcId}`,
    name: food.name,
    source: "usda",
    per100g: food.per100g,
    perPortion: null,
    rawOrCooked: inferUsdaState(food.name),
    estimate: false,
    portions: food.portions,
    createdAt: Date.now(),
  };
}

export type UsdaSearcher = (query: string) => Promise<{ available: boolean; foods: UsdaFood[] }>;

// Runs search_food. Every result is stored, so a confirm card can use the stored
// numbers through its ref rather than numbers the model typed.
export async function searchFood(query: string, searchUsda: UsdaSearcher) {
  const words = tokenize(query);
  const saved = await searchSavedFoods(words);
  const history = await searchHistory(words);

  let usdaFoods: UsdaFood[] = [];
  let usdaAvailable = true;
  try {
    const usda = await searchUsda(query);
    usdaAvailable = usda.available;
    usdaFoods = usda.foods.slice(0, MAX_USDA_RESULTS);
  } catch {
    usdaAvailable = false;
  }
  const usda = usdaFoods.map(usdaLookup);

  await db.foodLookups.bulkPut([...saved, ...history.map((group) => group.lookup), ...usda]);

  const describe = (lookup: FoodLookup) => ({
    ref: lookup.ref,
    name: lookup.name,
    source: lookup.source,
    per_100g: lookup.per100g,
    per_portion: lookup.perPortion,
    raw_or_cooked: lookup.rawOrCooked,
    estimate: lookup.estimate,
    portions: lookup.portions.slice(0, MAX_PORTIONS_SHOWN),
  });

  return {
    results: [
      ...saved.map(describe),
      ...history.map((group) => ({
        ...describe(group.lookup),
        times_logged: group.timesLogged,
        last_logged: group.lastLogged,
      })),
      ...usda.map(describe),
    ],
    ...(usdaAvailable ? {} : { note: "USDA is unavailable right now, so only the user's own foods were searched." }),
  };
}
