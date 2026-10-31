import { z } from "zod";
import { isValidDateKey } from "./dates";
import { db, type CustomFood, type Day, type Entry, type Meal } from "./db";
import { inferImportedState } from "./food/rawCooked";

const OptionalAmount = z.number().min(0).nullish();

const MEALS: readonly string[] = ["breakfast", "lunch", "dinner", "snack"];

const HistoryFile = z.object({
  days: z.array(
    z.object({
      date: z.string().refine(isValidDateKey, "must be a real date written as YYYY-MM-DD"),
      weight_kg: z.number().positive().nullish(),
      entries: z
        .array(
          z.object({
            food: z.string().trim().min(1),
            grams: OptionalAmount,
            kcal: OptionalAmount,
            protein: OptionalAmount,
            carbs: OptionalAmount,
            fat: OptionalAmount,
            meal: z.string().nullish(),
            estimate: z.boolean().nullish(),
          }),
        )
        .nullish(),
    }),
  ),
  saved_foods: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        per_100g: z
          .object({ kcal: OptionalAmount, protein: OptionalAmount, carbs: OptionalAmount, fat: OptionalAmount })
          .nullish(),
        serving_g: z.number().positive().nullish(),
      }),
    )
    .nullish(),
});

export type ParsedHistory = z.infer<typeof HistoryFile>;

export type HistoryPreview = {
  days: number;
  entries: number;
  savedFoods: number;
  weights: number;
  firstDate: string | null;
  lastDate: string | null;
};

export type ParseResult =
  | { ok: true; history: ParsedHistory; preview: HistoryPreview }
  | { ok: false; errors: string[] };

const MAX_ERRORS_SHOWN = 5;

export function parseHistoryFile(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["This file isn't valid JSON."] };
  }

  const parsed = HistoryFile.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues
        .slice(0, MAX_ERRORS_SHOWN)
        .map((issue) => `${issue.path.join(".") || "File"}: ${issue.message}`),
    };
  }

  const history = parsed.data;
  const dates = history.days.map((day) => day.date).sort();
  return {
    ok: true,
    history,
    preview: {
      days: new Set(dates).size,
      entries: history.days.reduce((total, day) => total + (day.entries?.length ?? 0), 0),
      savedFoods: history.saved_foods?.length ?? 0,
      weights: history.days.filter((day) => day.weight_kg != null).length,
      firstDate: dates[0] ?? null,
      lastDate: dates.at(-1) ?? null,
    },
  };
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function buildEntries(history: ParsedHistory): Entry[] {
  return history.days.flatMap((day) => {
    const [year, month, date] = day.date.split("-").map(Number);
    const noon = new Date(year, month - 1, date, 12).getTime();
    return (day.entries ?? []).map((entry, index): Entry => {
      const meal = entry.meal?.toLowerCase() ?? null;
      return {
        // Built from the file's contents, so importing it again finds the same ids.
        id: `imported:${day.date}:${index}:${slug(entry.food)}`,
        date: day.date,
        food: entry.food,
        grams: entry.grams || null,
        rawOrCooked: inferImportedState(entry.food),
        kcal: entry.kcal ?? null,
        protein: entry.protein ?? null,
        carbs: entry.carbs ?? null,
        fat: entry.fat ?? null,
        meal: meal && MEALS.includes(meal) ? (meal as Meal) : null,
        estimate: entry.estimate ?? false,
        source: "imported",
        timestamp: noon + index,
      };
    });
  });
}

export type ImportResult = {
  entriesAdded: number;
  entriesSkipped: number;
  foodsAdded: number;
  foodsSkipped: number;
  weightsAdded: number;
};

// Adds what's new and never overwrites anything already on the phone, so it's
// safe to run the same file twice.
export async function importHistory(history: ParsedHistory): Promise<ImportResult> {
  return db.transaction("rw", db.entries, db.days, db.customFoods, async () => {
    const entries = buildEntries(history);
    const existing = await db.entries.bulkGet(entries.map((entry) => entry.id));
    const newEntries = entries.filter((_, index) => existing[index] === undefined);
    await db.entries.bulkAdd(newEntries);

    let weightsAdded = 0;
    for (const day of history.days) {
      if (day.weight_kg == null) continue;
      const current = await db.days.get(day.date);
      if (current?.weightKg != null) continue;
      const record: Day = { date: day.date, weightKg: day.weight_kg, incomplete: current?.incomplete ?? false };
      await db.days.put(record);
      weightsAdded += 1;
    }

    let foodsAdded = 0;
    let foodsSkipped = 0;
    for (const food of history.saved_foods ?? []) {
      if (await db.customFoods.where("name").equalsIgnoreCase(food.name).first()) {
        foodsSkipped += 1;
        continue;
      }
      const record: CustomFood = {
        id: `imported:${slug(food.name)}`,
        name: food.name,
        per100g: {
          kcal: food.per_100g?.kcal ?? null,
          protein: food.per_100g?.protein ?? null,
          carbs: food.per_100g?.carbs ?? null,
          fat: food.per_100g?.fat ?? null,
        },
        servingG: food.serving_g ?? null,
        createdAt: Date.now(),
      };
      await db.customFoods.add(record);
      foodsAdded += 1;
    }

    return {
      entriesAdded: newEntries.length,
      entriesSkipped: entries.length - newEntries.length,
      foodsAdded,
      foodsSkipped,
      weightsAdded,
    };
  });
}
