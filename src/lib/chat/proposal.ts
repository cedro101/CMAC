import type { FoodLookup, FoodSource, Macros, ProposalItem, RawOrCooked } from "../db";
import { findPortionDefault, findUsdaPortion } from "../food/portions";
import { inferRawOrCooked, needsRawOrCooked } from "../food/rawCooked";
import { multiplyMacros, scaleFromPer100g } from "../macros";

export type ProposedItemInput = {
  food: string;
  kind: "lookup" | "user_number" | "estimate";
  ref?: string | null;
  grams?: number | null;
  count?: number | null;
  size?: string | null;
  raw_or_cooked?: RawOrCooked | null;
  numbers?: Macros | null;
};

export type ItemResult = { ok: true; item: ProposalItem } | { ok: false; error: string };

function buildItem(
  input: ProposedItemInput,
  fields: {
    macros: Macros;
    grams: number | null;
    portion?: string | null;
    source: FoodSource;
    estimate: boolean;
    rawOrCooked?: RawOrCooked | null;
  },
): ItemResult {
  const rawOrCooked =
    input.raw_or_cooked ?? fields.rawOrCooked ?? inferRawOrCooked(input.food);

  // An unweighed restaurant dish has no weight for raw or cooked to apply to.
  if (fields.grams !== null && rawOrCooked === null && needsRawOrCooked(input.food)) {
    return {
      ok: false,
      error: `"${input.food}" needs raw_or_cooked. Ask the user whether the weight is raw or cooked.`,
    };
  }

  return {
    ok: true,
    item: {
      id: crypto.randomUUID(),
      food: input.food,
      grams: fields.grams,
      rawOrCooked,
      portion: fields.portion ?? null,
      source: fields.source,
      estimate: fields.estimate,
      ...fields.macros,
    },
  };
}

function resolveLookupItem(input: ProposedItemInput, lookup: FoodLookup | null): ItemResult {
  if (!input.ref) {
    return { ok: false, error: `"${input.food}" needs a ref from search_food or get_day.` };
  }
  if (!lookup) {
    return { ok: false, error: `Unknown ref "${input.ref}" for "${input.food}". Call search_food first.` };
  }

  const stated = input.raw_or_cooked ?? null;
  if (stated && lookup.rawOrCooked && stated !== lookup.rawOrCooked) {
    return {
      ok: false,
      error: `"${input.food}" is ${stated} but "${lookup.name}" is ${lookup.rawOrCooked}. Use a ${stated} result.`,
    };
  }

  const count = input.count ?? null;
  const shared = {
    source: lookup.source as FoodSource,
    estimate: lookup.estimate,
    // USDA's state only describes the record, so it never answers the question
    // for you. Your saved foods and past logs do.
    rawOrCooked: lookup.source === "usda" ? null : lookup.rawOrCooked,
  };

  let grams = input.grams ?? null;
  let portion: string | null = null;
  let estimate = shared.estimate;

  if (grams === null && count !== null && lookup.per100g) {
    const own = findPortionDefault(input.food);
    const usda = own ? null : findUsdaPortion(lookup.portions, input.size);
    if (own) {
      grams = count * own.grams;
      portion = `${count} × ${own.label} (default)`;
      estimate = true;
    } else if (usda) {
      grams = count * usda.grams;
      portion = `${count} × ${usda.label} (USDA portion)`;
    }
  }

  if (grams !== null) {
    if (!lookup.per100g) {
      return { ok: false, error: `"${lookup.name}" has no per 100 g values. Log it without grams.` };
    }
    return buildItem(input, {
      ...shared,
      estimate,
      grams: Math.round(grams * 10) / 10,
      portion,
      macros: scaleFromPer100g(lookup.per100g, grams),
    });
  }

  if (lookup.perPortion) {
    const factor = count ?? 1;
    const defaultGrams = lookup.defaultGrams ?? null;
    return buildItem(input, {
      ...shared,
      grams: defaultGrams === null ? null : defaultGrams * factor,
      portion: count ? `${count} × portion` : null,
      macros: multiplyMacros(lookup.perPortion, factor),
    });
  }

  if (count !== null) {
    return {
      ok: false,
      error: `"${lookup.name}" has no standard portion. Ask the user for the weight in grams.`,
    };
  }
  return { ok: false, error: `"${input.food}" needs grams or a count. Ask the user how much they had.` };
}

// Turns one item from propose_log into a card item. The model chooses the food
// and the amount, and the numbers are calculated here.
export function resolveItem(input: ProposedItemInput, lookup: FoodLookup | null): ItemResult {
  if (input.kind === "lookup") return resolveLookupItem(input, lookup);

  const numbers = input.numbers;
  if (!numbers) return { ok: false, error: `"${input.food}" needs numbers for kind ${input.kind}.` };

  if (input.kind === "estimate") {
    if (numbers.protein === null) {
      return { ok: false, error: `Estimate for "${input.food}" must include protein.` };
    }
    return buildItem(input, {
      grams: input.grams ?? null,
      source: "estimate",
      estimate: true,
      macros: numbers,
    });
  }

  return buildItem(input, {
    grams: input.grams ?? null,
    source: "user",
    estimate: false,
    macros: numbers,
  });
}
