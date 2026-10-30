import { describe, expect, it } from "vitest";
import { findPortionDefault, findUsdaPortion } from "./portions";
import { inferRawOrCooked, inferUsdaState, needsRawOrCooked } from "./rawCooked";
import { parseUsdaFoods, parseUsdaPortions } from "./usdaParse";

describe("needsRawOrCooked", () => {
  it.each(["Chicken breast", "basmati rice", "Pasta", "200g potatoes", "air fried fries", "Sweet potato", "beef mince"])(
    "requires it for %s",
    (food) => expect(needsRawOrCooked(food)).toBe(true),
  );

  it.each(["Apple", "Tomato", "Greek yogurt", "rice cakes", "potato chips", "chicken broth", "licorice"])(
    "doesn't require it for %s",
    (food) => expect(needsRawOrCooked(food)).toBe(false),
  );
});

describe("inferRawOrCooked", () => {
  it.each([
    ["Chicken breast (raw weight)", "raw"],
    ["Chicken breast, cooked", "cooked"],
    ["Grilled chicken", "cooked"],
    ["Frozen fries", null],
    ["Air fried fries", null],
    ["Greek yogurt", null],
  ])("%s is %s", (name, expected) => expect(inferRawOrCooked(name)).toBe(expected));
});

describe("inferUsdaState", () => {
  it.each([
    ["Chicken, breast, boneless, skinless, raw", "raw"],
    ["Apples, raw, without skin, cooked, boiled", "cooked"],
    ["Potatoes, french fried, frozen, unprepared", "cooked"],
    ["Potatoes, frozen, unprepared", "raw"],
    ["Rice, white, long-grain, cooked", "cooked"],
    ["Yogurt, Greek, plain", null],
  ])("%s is %s", (name, expected) => expect(inferUsdaState(name)).toBe(expected));
});

describe("portions", () => {
  const apple = [
    { label: 'large (3-1/4" dia)', grams: 216 },
    { label: "cup slices", grams: 110 },
    { label: 'medium (3" dia)', grams: 161 },
  ];

  it("assumes medium", () => expect(findUsdaPortion(apple)?.grams).toBe(161));
  it("matches a size", () => expect(findUsdaPortion(apple, "Large")?.grams).toBe(216));
  it("returns null with no match", () => expect(findUsdaPortion(apple, "small")).toBeNull());
  it("isn't confused by special characters", () => expect(findUsdaPortion(apple, "(x")).toBeNull());

  it("has a Lebanese cucumber default but not one for any cucumber", () => {
    expect(findPortionDefault("2 Lebanese cucumbers")?.grams).toBe(100);
    expect(findPortionDefault("Cucumber")).toBeNull();
  });
});

describe("parseUsdaFoods", () => {
  it("uses plain Energy when it exists", () => {
    const [food] = parseUsdaFoods({
      foods: [
        {
          fdcId: 171077,
          description: "Chicken breast, raw",
          dataType: "SR Legacy",
          foodNutrients: [
            { nutrientId: 1008, value: 120 },
            { nutrientId: 1003, value: 22.5 },
            { nutrientId: 1005, value: 0 },
            { nutrientId: 1004, value: 2.62 },
          ],
        },
      ],
    });
    expect(food.per100g).toEqual({ kcal: 120, protein: 22.5, carbs: 0, fat: 2.62 });
  });

  it("falls back to Atwater energy and fixes negative carbs", () => {
    const [food] = parseUsdaFoods({
      foods: [
        {
          fdcId: 2727569,
          description: "Chicken, breast, meat and skin, raw",
          foodNutrients: [
            { nutrientId: 2047, value: 127 },
            { nutrientId: 2048, value: 133 },
            { nutrientId: 1005, value: -0.428 },
          ],
        },
      ],
    });
    expect(food.per100g).toEqual({ kcal: 133, protein: null, carbs: 0, fat: null });
  });

  it("returns nothing for an unexpected response", () => {
    expect(parseUsdaFoods(null)).toEqual([]);
    expect(parseUsdaFoods({ foods: [{ description: "No id" }] })).toEqual([]);
  });
});

describe("parseUsdaPortions", () => {
  it("reads portions per one unit and skips unusable ones", () => {
    const portions = parseUsdaPortions([
      {
        fdcId: 1,
        foodPortions: [
          { amount: 1, modifier: 'medium (3" dia)', gramWeight: 161 },
          { amount: 2, portionDescription: "2 slices", gramWeight: 60 },
          { amount: 1, modifier: "no weight" },
        ],
      },
    ]);
    expect(portions.get(1)).toEqual([
      { label: 'medium (3" dia)', grams: 161 },
      { label: "2 slices", grams: 30 },
    ]);
  });
});
