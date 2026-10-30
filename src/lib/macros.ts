import type { Macros } from "./db";

export const MACRO_KEYS = ["kcal", "protein", "carbs", "fat"] as const;
export type MacroKey = (typeof MACRO_KEYS)[number];

export type MacroTotals = Record<MacroKey, { value: number; partial: boolean }>;

function roundMacro(key: MacroKey, value: number): number {
  return key === "kcal" ? Math.round(value) : Math.round(value * 10) / 10;
}

export function multiplyMacros(macros: Macros, factor: number): Macros {
  const result = { kcal: null, protein: null, carbs: null, fat: null } as Macros;
  for (const key of MACRO_KEYS) {
    const value = macros[key];
    result[key] = value === null ? null : roundMacro(key, value * factor);
  }
  return result;
}

export function scaleFromPer100g(per100g: Macros, grams: number): Macros {
  return multiplyMacros(per100g, grams / 100);
}

// Adds up what's known. A macro is "partial" when any item is missing it.
export function sumMacros(items: Macros[]): MacroTotals {
  const totals = {} as MacroTotals;
  for (const key of MACRO_KEYS) {
    let value = 0;
    let partial = false;
    for (const item of items) {
      const amount = item[key];
      if (amount === null) partial = true;
      else value += amount;
    }
    totals[key] = { value: roundMacro(key, value), partial };
  }
  return totals;
}

export type EditableFood = Macros & {
  grams: number | null;
  source: string;
};

// Applies changes to an entry or a card item. Changing the grams rescales the
// macros from the stored values, unless a new number was given for that macro.
export function applyFoodEdit<T extends EditableFood>(record: T, changes: Partial<T>): T {
  const next = { ...record };
  for (const [key, value] of Object.entries(changes)) {
    if (value !== undefined) (next as Record<string, unknown>)[key] = value;
  }

  const typedMacros = MACRO_KEYS.filter(
    (key) => changes[key] !== undefined && changes[key] !== record[key],
  );

  const oldGrams = record.grams;
  const newGrams = next.grams;
  if (oldGrams && newGrams && oldGrams !== newGrams) {
    for (const key of MACRO_KEYS) {
      const value = record[key];
      if (!typedMacros.includes(key) && value !== null) {
        (next as Macros)[key] = roundMacro(key, (value * newGrams) / oldGrams);
      }
    }
  }

  if (typedMacros.length > 0) next.source = "user";
  return next;
}
