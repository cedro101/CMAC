import type { Macros } from "../db";
import { MACRO_KEYS, multiplyMacros } from "../macros";

export type LabelFoodInput = {
  name: string;
  serving_g?: number | null;
  per_serving?: Macros | null;
  per_100g?: Macros | null;
};

export type LabelFood = {
  name: string;
  servingG: number | null;
  perServing: Macros | null;
  per100g: Macros;
};

function hasAnyValue(macros: Macros | null | undefined): macros is Macros {
  return !!macros && MACRO_KEYS.some((key) => macros[key] !== null);
}

// Takes what the label shows and calculates the other column in code. Labels
// often only list per serving, so per 100 g comes from the serving weight.
export function resolveLabelFood(
  input: LabelFoodInput,
): { ok: true; food: LabelFood } | { ok: false; error: string } {
  const servingG = input.serving_g ?? null;
  const perServing = hasAnyValue(input.per_serving) ? input.per_serving : null;
  const per100g = hasAnyValue(input.per_100g) ? input.per_100g : null;

  if (per100g) {
    return {
      ok: true,
      food: {
        name: input.name,
        servingG,
        perServing: perServing ?? (servingG ? multiplyMacros(per100g, servingG / 100) : null),
        per100g,
      },
    };
  }

  if (perServing && servingG) {
    return {
      ok: true,
      food: { name: input.name, servingG, perServing, per100g: multiplyMacros(perServing, 100 / servingG) },
    };
  }

  if (perServing) {
    return { ok: false, error: "The label's serving size in grams is needed. Ask the user for it." };
  }
  return { ok: false, error: "No nutrition values could be read. Ask the user for a clearer photo of the label." };
}
