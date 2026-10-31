import type { Batch, FoodLookup, Macros } from "../db";
import { MACRO_KEYS } from "../macros";

const BATCH_LIFETIME_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// Cooking only loses water, so the raw food's macros are spread over the cooked
// weight. Kept precise here, and rounded when an amount is logged.
export function buildBatch(
  input: { name: string; rawG: number; cookedG: number },
  rawFood: FoodLookup,
  now: number,
): { ok: true; batch: Batch } | { ok: false; error: string } {
  if (!rawFood.per100g) {
    return { ok: false, error: `"${rawFood.name}" has no per 100 g values, so it can't be used for a batch.` };
  }
  if (rawFood.rawOrCooked === "cooked") {
    return { ok: false, error: `"${rawFood.name}" is a cooked record. A batch needs the raw food's numbers.` };
  }

  const perCookedGram = {} as Macros;
  for (const key of MACRO_KEYS) {
    const value = rawFood.per100g[key];
    perCookedGram[key] = value === null ? null : (value * input.rawG) / 100 / input.cookedG;
  }

  return {
    ok: true,
    batch: {
      id: crypto.randomUUID(),
      name: input.name,
      food: rawFood.name,
      rawG: input.rawG,
      cookedG: input.cookedG,
      perCookedGram,
      createdAt: now,
      expiresAt: now + BATCH_LIFETIME_DAYS * DAY_MS,
    },
  };
}

export function isBatchActive(batch: Batch, now: number): boolean {
  return batch.expiresAt === null || batch.expiresAt > now;
}

export function per100gCooked(batch: Batch): Macros {
  const result = {} as Macros;
  for (const key of MACRO_KEYS) {
    const value = batch.perCookedGram[key];
    result[key] = value === null ? null : value * 100;
  }
  return result;
}

// Lets "190 g of the chicken batch" use the normal card calculation.
export function batchLookup(batch: Batch): FoodLookup {
  return {
    ref: `batch:${batch.id}`,
    name: batch.name,
    source: "batch",
    per100g: per100gCooked(batch),
    perPortion: null,
    rawOrCooked: "cooked",
    estimate: false,
    portions: [],
    createdAt: batch.createdAt,
  };
}
