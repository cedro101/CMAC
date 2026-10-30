import { describe, expect, it } from "vitest";
import { applyFoodEdit, scaleFromPer100g, sumMacros, type EditableFood } from "./macros";

const chicken = { kcal: 120, protein: 22.5, carbs: 0, fat: 2.62 };

describe("scaleFromPer100g", () => {
  it("scales and rounds kcal to whole numbers and macros to one decimal", () => {
    expect(scaleFromPer100g(chicken, 350)).toEqual({ kcal: 420, protein: 78.8, carbs: 0, fat: 9.2 });
  });

  it("keeps missing values missing", () => {
    expect(scaleFromPer100g({ ...chicken, fat: null }, 200).fat).toBeNull();
  });
});

describe("sumMacros", () => {
  it("adds known values and marks a macro partial when an entry is missing it", () => {
    const totals = sumMacros([
      { kcal: 385, protein: 80, carbs: 0, fat: null },
      { kcal: 100, protein: 5.5, carbs: 20, fat: 1 },
    ]);
    expect(totals.kcal).toEqual({ value: 485, partial: false });
    expect(totals.protein).toEqual({ value: 85.5, partial: false });
    expect(totals.fat).toEqual({ value: 1, partial: true });
  });

  it("returns zero, not partial, for an empty day", () => {
    expect(sumMacros([]).kcal).toEqual({ value: 0, partial: false });
  });
});

describe("applyFoodEdit", () => {
  const entry = { grams: 200, kcal: 240, protein: 45, carbs: 0, fat: 5.2, source: "usda", food: "Chicken" };

  it("rescales macros when the grams change", () => {
    const edited = applyFoodEdit(entry, { grams: 100 });
    expect(edited).toMatchObject({ grams: 100, kcal: 120, protein: 22.5, fat: 2.6, source: "usda" });
  });

  it("uses a typed number and marks the source as yours", () => {
    const edited = applyFoodEdit(entry, { grams: 100, kcal: 150 });
    expect(edited).toMatchObject({ grams: 100, kcal: 150, protein: 22.5, source: "user" });
  });

  it("keeps macros when the old weight is unknown", () => {
    const edited = applyFoodEdit<EditableFood>({ ...entry, grams: null }, { grams: 100 });
    expect(edited.kcal).toBe(240);
  });

  it("keeps missing macros missing when rescaling", () => {
    const edited = applyFoodEdit({ ...entry, fat: null }, { grams: 100 });
    expect(edited.fat).toBeNull();
  });

  it("doesn't change the original", () => {
    applyFoodEdit(entry, { grams: 100 });
    expect(entry.grams).toBe(200);
  });
});
