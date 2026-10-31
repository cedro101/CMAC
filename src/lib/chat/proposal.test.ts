import { describe, expect, it } from "vitest";
import type { FoodLookup } from "../db";
import { resolveItem } from "./proposal";

function lookup(overrides: Partial<FoodLookup> = {}): FoodLookup {
  return {
    ref: "usda:1",
    name: "Chicken breast, raw",
    source: "usda",
    per100g: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6 },
    perPortion: null,
    rawOrCooked: "raw",
    estimate: false,
    portions: [],
    createdAt: 0,
    ...overrides,
  };
}

function expectItem(result: ReturnType<typeof resolveItem>) {
  if (!result.ok) throw new Error(result.error);
  return result.item;
}

function expectError(result: ReturnType<typeof resolveItem>) {
  if (result.ok) throw new Error("Expected an error");
  return result.error;
}

const apple = lookup({
  name: "Apples, raw",
  rawOrCooked: "raw",
  per100g: { kcal: 50, protein: 0.3, carbs: 13, fat: 0.2 },
  portions: [{ label: 'medium (3" dia)', grams: 160 }],
});

describe("lookup items", () => {
  it("calculates macros in code from the lookup", () => {
    const item = expectItem(
      resolveItem({ food: "Chicken breast", kind: "lookup", ref: "usda:1", grams: 350, raw_or_cooked: "raw" }, lookup()),
    );
    expect(item).toMatchObject({ grams: 350, kcal: 420, protein: 78.8, source: "usda", estimate: false });
  });

  it("rejects an item with no ref", () => {
    expect(expectError(resolveItem({ food: "Chicken", kind: "lookup", grams: 100 }, null))).toContain("ref");
  });

  it("rejects an unknown ref", () => {
    expect(expectError(resolveItem({ food: "Chicken", kind: "lookup", ref: "usda:9", grams: 100 }, null))).toContain(
      "Unknown ref",
    );
  });

  it("asks for raw or cooked when weighed meat doesn't say", () => {
    const error = expectError(resolveItem({ food: "Chicken breast", kind: "lookup", ref: "usda:1", grams: 200 }, lookup()));
    expect(error).toContain("raw_or_cooked");
  });

  it("asks for raw or cooked for potatoes and fries", () => {
    for (const food of ["Potatoes", "Frozen fries", "Air fried fries"]) {
      const potato = lookup({ name: food, rawOrCooked: null });
      expect(expectError(resolveItem({ food, kind: "lookup", ref: "usda:1", grams: 200 }, potato))).toContain("raw_or_cooked");
    }
  });

  it("uses the state from the food name", () => {
    const item = expectItem(
      resolveItem({ food: "Chicken breast (cooked weight)", kind: "lookup", ref: "usda:1", grams: 200 }, lookup({ rawOrCooked: null })),
    );
    expect(item.rawOrCooked).toBe("cooked");
  });

  it("rejects raw numbers for a cooked entry", () => {
    const error = expectError(
      resolveItem({ food: "Chicken", kind: "lookup", ref: "usda:1", grams: 200, raw_or_cooked: "cooked" }, lookup()),
    );
    expect(error).toContain("Use a cooked result");
  });

  it("takes raw or cooked from your history", () => {
    const item = expectItem(
      resolveItem(
        { food: "Chicken breast", kind: "lookup", ref: "history:x", grams: 200 },
        lookup({ source: "history", rawOrCooked: "cooked" }),
      ),
    );
    expect(item.rawOrCooked).toBe("cooked");
  });

  it("asks for an amount when there's no weight or count", () => {
    expect(expectError(resolveItem({ food: "Rice", kind: "lookup", ref: "usda:1" }, lookup()))).toContain("grams or a count");
  });

  it("reuses your past numbers for an unweighed meal", () => {
    const past = lookup({
      source: "history",
      per100g: null,
      perPortion: { kcal: 700, protein: 40, carbs: 60, fat: 30 },
      estimate: true,
      rawOrCooked: null,
    });
    const item = expectItem(resolveItem({ food: "Shawarma saj", kind: "lookup", ref: "history:x" }, past));
    expect(item).toMatchObject({ grams: null, kcal: 700, source: "history", estimate: true });
  });
});

describe("past restaurant meals with a weight", () => {
  const grillHouse = lookup({
    ref: "history:Grill House",
    name: "Mandi chicken (Grill House), meat only",
    source: "history",
    per100g: { kcal: 165, protein: 25, carbs: null, fat: null },
    perPortion: { kcal: 660, protein: 100, carbs: null, fat: null },
    defaultGrams: 400,
    rawOrCooked: null,
    estimate: true,
  });

  it("repeats the whole meal without asking for grams or raw or cooked", () => {
    const item = expectItem(resolveItem({ food: "Mandi chicken (Grill House)", kind: "lookup", ref: grillHouse.ref }, grillHouse));
    expect(item).toMatchObject({ grams: 400, kcal: 660, protein: 100, source: "history", estimate: true });
  });

  it("still scales when given a weight", () => {
    const item = expectItem(resolveItem({ food: "Mandi chicken (Grill House)", kind: "lookup", ref: grillHouse.ref, grams: 200 }, grillHouse));
    expect(item).toMatchObject({ grams: 200, kcal: 330, protein: 50 });
  });

  it("handles half a portion", () => {
    const item = expectItem(resolveItem({ food: "Mandi chicken (Grill House)", kind: "lookup", ref: grillHouse.ref, count: 0.5 }, grillHouse));
    expect(item).toMatchObject({ grams: 200, kcal: 330 });
  });

  it("doesn't ask raw or cooked for a weighed estimate", () => {
    const numbers = { kcal: 500, protein: 30, carbs: null, fat: null };
    expect(resolveItem({ food: "Chicken plate", kind: "estimate", numbers, grams: 300 }, null).ok).toBe(true);
  });
});

describe("counted produce", () => {
  it("uses a USDA medium portion with no weight", () => {
    const item = expectItem(resolveItem({ food: "Apple", kind: "lookup", ref: "usda:1", count: 1 }, apple));
    expect(item).toMatchObject({ grams: 160, kcal: 80, estimate: false });
    expect(item.portion).toContain("USDA portion");
  });

  it("multiplies by the count", () => {
    const item = expectItem(resolveItem({ food: "Apple", kind: "lookup", ref: "usda:1", count: 2 }, apple));
    expect(item.grams).toBe(320);
  });

  it("prefers given grams over a portion", () => {
    const item = expectItem(resolveItem({ food: "Apple", kind: "lookup", ref: "usda:1", count: 1, grams: 150 }, apple));
    expect(item).toMatchObject({ grams: 150, portion: null });
  });

  it("uses your Lebanese cucumber default and marks it as an estimate", () => {
    const cucumber = lookup({
      name: "Cucumber, raw",
      per100g: { kcal: 15, protein: 0.7, carbs: 3.6, fat: 0.1 },
      portions: [{ label: "medium", grams: 301 }],
    });
    const item = expectItem(resolveItem({ food: "Lebanese cucumber", kind: "lookup", ref: "usda:1", count: 1 }, cucumber));
    expect(item).toMatchObject({ grams: 100, kcal: 15, estimate: true, source: "usda" });
    expect(item.portion).toContain("default");
  });

  it("asks for grams when there's no portion", () => {
    const error = expectError(resolveItem({ food: "Apple", kind: "lookup", ref: "usda:1", count: 1 }, lookup({ name: "Apple", rawOrCooked: null })));
    expect(error).toContain("no standard portion");
  });
});

describe("numbers from outside a lookup", () => {
  const numbers = { kcal: 210, protein: 20, carbs: null, fat: null };

  it("uses a number you gave", () => {
    const item = expectItem(resolveItem({ food: "Protein bar", kind: "user_number", numbers }, null));
    expect(item).toMatchObject({ kcal: 210, source: "user", estimate: false, grams: null });
  });

  it("always marks estimates", () => {
    const item = expectItem(resolveItem({ food: "Beef shawarma saj", kind: "estimate", numbers }, null));
    expect(item).toMatchObject({ source: "estimate", estimate: true });
  });

  it("doesn't ask raw or cooked for an unweighed dish", () => {
    expect(resolveItem({ food: "Half chicken from Grill House", kind: "estimate", numbers }, null).ok).toBe(true);
  });

  it("requires protein on estimates", () => {
    const error = expectError(resolveItem({ food: "Pizza", kind: "estimate", numbers: { ...numbers, protein: null } }, null));
    expect(error).toContain("protein");
  });
});
