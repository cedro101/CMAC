import type { FoodPortion, Macros } from "../db";

export type UsdaFood = {
  fdcId: number;
  name: string;
  dataType: string;
  per100g: Macros;
  portions: FoodPortion[];
};

// USDA nutrient ids. Foundation foods often have no plain Energy value, only
// the two Atwater ones, so calories check all three in this order.
const ENERGY_IDS = [1008, 2048, 2047];
const PROTEIN_ID = 1003;
const CARBS_ID = 1005;
const FAT_ID = 1004;

type RawNutrient = { nutrientId?: unknown; value?: unknown };

function readNutrient(nutrients: RawNutrient[], ids: number[]): number | null {
  for (const id of ids) {
    const value = nutrients.find((nutrient) => nutrient.nutrientId === id)?.value;
    if (typeof value === "number" && Number.isFinite(value)) {
      // USDA calculates some values by subtraction, which can go slightly negative.
      return Math.max(0, value);
    }
  }
  return null;
}

export function parseUsdaFoods(data: unknown): UsdaFood[] {
  const foods = (data as { foods?: unknown })?.foods;
  if (!Array.isArray(foods)) return [];

  return foods.flatMap((food): UsdaFood[] => {
    if (typeof food?.fdcId !== "number" || typeof food?.description !== "string") return [];
    const nutrients: RawNutrient[] = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
    return [
      {
        fdcId: food.fdcId,
        name: food.description,
        dataType: typeof food.dataType === "string" ? food.dataType : "",
        per100g: {
          kcal: readNutrient(nutrients, ENERGY_IDS),
          protein: readNutrient(nutrients, [PROTEIN_ID]),
          carbs: readNutrient(nutrients, [CARBS_ID]),
          fat: readNutrient(nutrients, [FAT_ID]),
        },
        portions: [],
      },
    ];
  });
}

// Reads standard portions from USDA's food detail response. Weights are stored
// per one portion.
export function parseUsdaPortions(data: unknown): Map<number, FoodPortion[]> {
  const result = new Map<number, FoodPortion[]>();
  if (!Array.isArray(data)) return result;

  for (const food of data) {
    if (typeof food?.fdcId !== "number" || !Array.isArray(food.foodPortions)) continue;
    const portions: FoodPortion[] = [];
    for (const portion of food.foodPortions) {
      const label = [portion?.portionDescription, portion?.modifier].find(
        (text) => typeof text === "string" && text.trim() !== "",
      ) as string | undefined;
      const amount = typeof portion?.amount === "number" && portion.amount > 0 ? portion.amount : 1;
      const grams = portion?.gramWeight;
      if (label && typeof grams === "number" && grams > 0) {
        portions.push({ label: label.trim(), grams: Math.round((grams / amount) * 10) / 10 });
      }
    }
    result.set(food.fdcId, portions);
  }
  return result;
}
