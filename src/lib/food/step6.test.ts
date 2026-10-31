import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { resolveItem } from "../chat/proposal";
import { resolveLabelFood } from "../chat/labelFood";
import { executeTool } from "../chat/tools";
import { db, type FoodLookup } from "../db";
import { cancelFoodCard, confirmFoodCard, deleteBatch, undoChange } from "../log";
import { batchLookup, buildBatch, isBatchActive } from "./batch";

const rawChicken: FoodLookup = {
  ref: "usda:1",
  name: "Chicken breast, raw",
  source: "usda",
  per100g: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6 },
  perPortion: null,
  rawOrCooked: "raw",
  estimate: false,
  portions: [],
  createdAt: 0,
};

const noUsda = async () => ({ available: true, foods: [] });
const DAY = "2026-10-30";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function built() {
  const result = buildBatch({ name: "Chicken batch", rawG: 1078, cookedG: 850 }, rawChicken, 1000);
  if (!result.ok) throw new Error(result.error);
  return result.batch;
}

describe("batches", () => {
  it("spreads the raw food's macros over the cooked weight", () => {
    const batch = built();
    expect(batch.perCookedGram.kcal).toBeCloseTo((120 * 10.78) / 850, 5);
    expect(batch.perCookedGram.protein).toBeCloseTo((22.5 * 10.78) / 850, 5);
  });

  it("logs the spec's example: 190 g of the batch, weighed cooked", () => {
    const item = resolveItem(
      { food: "Chicken batch", kind: "lookup", ref: "batch:x", grams: 190 },
      batchLookup(built()),
    );
    if (!item.ok) throw new Error(item.error);
    // 1078 g raw is 1293.6 kcal in 850 g cooked, so 190 g cooked is about 289 kcal.
    expect(item.item).toMatchObject({ grams: 190, rawOrCooked: "cooked", kcal: 289, protein: 54.2, source: "batch" });
  });

  it("the whole batch adds up to the raw food", () => {
    const item = resolveItem({ food: "Chicken batch", kind: "lookup", ref: "batch:x", grams: 850 }, batchLookup(built()));
    if (!item.ok) throw new Error(item.error);
    expect(item.item.kcal).toBe(1294);
  });

  it("won't take a raw weight for a cooked batch", () => {
    const item = resolveItem(
      { food: "Chicken batch", kind: "lookup", ref: "batch:x", grams: 190, raw_or_cooked: "raw" },
      batchLookup(built()),
    );
    expect(item.ok).toBe(false);
  });

  it("rejects a cooked record as the raw food", () => {
    const result = buildBatch({ name: "B", rawG: 100, cookedG: 80 }, { ...rawChicken, rawOrCooked: "cooked" }, 0);
    expect(result.ok).toBe(false);
  });

  it("expires after 7 days", () => {
    const batch = built();
    expect(isBatchActive(batch, 1000 + 6 * 86400000)).toBe(true);
    expect(isBatchActive(batch, 1000 + 7 * 86400000)).toBe(false);
  });

  it("works through the tools, from search to card", async () => {
    await db.foodLookups.put(rawChicken);
    const created = await executeTool(
      "create_batch",
      { name: "Chicken batch", raw_g: 1078, cooked_g: 850, ref: "usda:1" },
      noUsda,
      DAY,
    );
    expect(created.isError).toBe(false);
    const { ref } = JSON.parse(created.content);

    const listed = JSON.parse((await executeTool("list_batches", {}, noUsda, DAY)).content);
    expect(listed.batches[0]).toMatchObject({ ref, name: "Chicken batch", per_100g_cooked: { kcal: 152.2 } });

    const card = await executeTool(
      "propose_log",
      { items: [{ food: "Chicken batch", kind: "lookup", ref, grams: 190 }] },
      noUsda,
      DAY,
    );
    expect(card.isError).toBe(false);
    expect((await db.proposals.toArray())[0].items[0]).toMatchObject({ kcal: 289, source: "batch" });
  });

  it("won't log from an expired batch", async () => {
    const batch = { ...built(), expiresAt: Date.now() - 1000 };
    await db.batches.add(batch);
    const card = await executeTool(
      "propose_log",
      { items: [{ food: "Chicken batch", kind: "lookup", ref: `batch:${batch.id}`, grams: 190 }] },
      noUsda,
      DAY,
    );
    expect(card.isError).toBe(true);
    expect(JSON.parse((await executeTool("list_batches", {}, noUsda, DAY)).content).batches).toEqual([]);
  });

  it("deletes a batch with Undo", async () => {
    const batch = built();
    await db.batches.add(batch);
    await deleteBatch(batch.id);
    expect(await db.batches.count()).toBe(0);
    const change = await db.changes.orderBy("createdAt").last();
    await undoChange(change?.id ?? "");
    expect(await db.batches.get(batch.id)).toEqual(batch);
  });
});

describe("label foods", () => {
  const perServing = { kcal: 240, protein: 21, carbs: 22, fat: 9 };

  it("calculates per 100 g from per serving", () => {
    const result = resolveLabelFood({ name: "Bar", serving_g: 60, per_serving: perServing });
    expect(result).toMatchObject({ ok: true, food: { servingG: 60, per100g: { kcal: 400, protein: 35 } } });
  });

  it("calculates per serving from per 100 g", () => {
    const result = resolveLabelFood({ name: "Bar", serving_g: 60, per_100g: { kcal: 400, protein: 35, carbs: 36.7, fat: 15 } });
    expect(result).toMatchObject({ ok: true, food: { perServing: { kcal: 240, protein: 21 } } });
  });

  it("asks when the serving weight is missing", () => {
    const result = resolveLabelFood({ name: "Bar", per_serving: perServing });
    expect(result).toMatchObject({ ok: false });
  });

  it("asks for a clearer photo when nothing could be read", () => {
    const blank = { kcal: null, protein: null, carbs: null, fat: null };
    expect(resolveLabelFood({ name: "Bar", per_100g: blank }).ok).toBe(false);
  });

  it("shows a card, saves nothing until confirmed, and saves only once", async () => {
    const result = await executeTool(
      "propose_label_food",
      { name: "Acme bar", serving_g: 60, per_serving: perServing },
      noUsda,
      DAY,
    );
    expect(result.isError).toBe(false);
    expect(await db.customFoods.count()).toBe(0);

    const [card] = await db.foodCards.toArray();
    await Promise.all([confirmFoodCard(card.id), confirmFoodCard(card.id)]);
    expect(await db.customFoods.count()).toBe(1);
    expect((await db.customFoods.toArray())[0]).toMatchObject({ name: "Acme bar", servingG: 60, per100g: { kcal: 400 } });
  });

  it("saves nothing if cancelled", async () => {
    await executeTool("propose_label_food", { name: "Bar", serving_g: 60, per_serving: perServing }, noUsda, DAY);
    const [card] = await db.foodCards.toArray();
    await cancelFoodCard(card.id);
    await confirmFoodCard(card.id);
    expect(await db.customFoods.count()).toBe(0);
  });

  it("replaces a card when corrected", async () => {
    await executeTool("propose_label_food", { name: "Bar", serving_g: 60, per_serving: perServing }, noUsda, DAY);
    const [first] = await db.foodCards.toArray();
    await executeTool(
      "propose_label_food",
      { name: "Bar", serving_g: 50, per_serving: perServing, replaces_card_id: first.id },
      noUsda,
      DAY,
    );
    expect((await db.foodCards.get(first.id))?.status).toBe("replaced");
    expect(await db.foodCards.count()).toBe(2);
  });
});

describe("saved meals", () => {
  it("saves a meal from past entries and logs it as a pending card", async () => {
    await db.entries.add({
      id: "e1",
      date: "2026-10-29",
      food: "Greek yogurt",
      grams: 200,
      rawOrCooked: null,
      kcal: 180,
      protein: 18,
      carbs: 20,
      fat: 3,
      meal: "breakfast",
      estimate: false,
      source: "imported",
      timestamp: 1,
    });

    const saved = await executeTool(
      "save_meal",
      { name: "Usual breakfast", items: [{ food: "Greek yogurt", kind: "lookup", ref: "entry:e1" }] },
      noUsda,
      DAY,
    );
    expect(saved.isError).toBe(false);
    expect((await db.meals.toArray())[0].items[0]).toMatchObject({ food: "Greek yogurt", grams: 200, kcal: 180 });

    const logged = await executeTool("use_saved_meal", { name: "usual breakfast", meal: "breakfast" }, noUsda, DAY);
    expect(logged.isError).toBe(false);
    const [card] = await db.proposals.toArray();
    expect(card).toMatchObject({ status: "pending", meal: "breakfast", date: DAY });
    expect(card.items[0]).toMatchObject({ kcal: 180, source: "saved" });
    expect(await db.entries.where("date").equals(DAY).count()).toBe(0);
  });

  it("replaces a meal saved under the same name", async () => {
    const numbers = { kcal: 100, protein: 10, carbs: 10, fat: 1 };
    await executeTool("save_meal", { name: "Usual", items: [{ food: "A", kind: "user_number", numbers }] }, noUsda, DAY);
    await executeTool("save_meal", { name: "usual", items: [{ food: "B", kind: "user_number", numbers }] }, noUsda, DAY);
    expect(await db.meals.count()).toBe(1);
    expect((await db.meals.toArray())[0].items[0].food).toBe("B");
  });

  it("reports an unknown meal", async () => {
    expect((await executeTool("use_saved_meal", { name: "Nope" }, noUsda, DAY)).isError).toBe(true);
  });
});

describe("estimate_maintenance", () => {
  it("returns both estimates and changes nothing", async () => {
    await db.days.add({ date: "2026-10-29", weightKg: 93, incomplete: false });
    const result = await executeTool("estimate_maintenance", {}, noUsda, DAY);
    const parsed = JSON.parse(result.content);
    expect(parsed.from_body).toMatchObject({ available: true, lowKcal: 3100, highKcal: 3500 });
    expect(parsed.from_history).toMatchObject({ available: false });
    expect(await db.settings.count()).toBe(0);
  });
});
