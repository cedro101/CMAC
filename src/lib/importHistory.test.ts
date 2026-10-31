import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { entriesToCardItems, findFrequentFoods } from "./food/frequent";
import { searchFood } from "./food/search";
import { importHistory, parseHistoryFile, type ParsedHistory } from "./importHistory";
import { confirmProposal, createProposal, logWeight, undoProposal, undoChange } from "./log";

// The exact shape from the spec.
const SAMPLE = {
  days: [
    {
      date: "2026-09-01",
      weight_kg: 78.5,
      entries: [
        { food: "Chicken breast (raw weight)", grams: 350, kcal: 385, protein: 80, carbs: 0, fat: null, meal: null, estimate: false },
        { food: "Rice, cooked", grams: 200, kcal: 260, protein: 5, carbs: 56, fat: 0.5, meal: "Lunch", estimate: false },
        { food: "Beef shawarma saj", grams: null, kcal: 700, protein: 40, carbs: null, fat: null, meal: "dinner", estimate: true },
      ],
    },
    { date: "2026-09-03", weight_kg: null, entries: [{ food: "Chicken breast (raw weight)", grams: 300, kcal: 330, protein: 69 }] },
    { date: "2026-09-02", weight_kg: 93.1, entries: null },
  ],
  saved_foods: [{ name: "Acme protein bar", per_100g: { kcal: 400, protein: 35, carbs: 36.7, fat: 15 }, serving_g: 60 }],
};

function parsed(data: unknown = SAMPLE): ParsedHistory {
  const result = parseHistoryFile(JSON.stringify(data));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.history;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("parseHistoryFile", () => {
  it("previews the spec's format", () => {
    const result = parseHistoryFile(JSON.stringify(SAMPLE));
    expect(result).toMatchObject({
      ok: true,
      preview: { days: 3, entries: 4, savedFoods: 1, weights: 2, firstDate: "2026-09-01", lastDate: "2026-09-03" },
    });
  });

  it("allows nulls or missing fields for everything except date and food", () => {
    expect(parseHistoryFile(JSON.stringify({ days: [{ date: "2026-09-01", entries: [{ food: "Apple" }] }] })).ok).toBe(true);
  });

  it.each([
    ["not JSON", "{nope"],
    ["no days", "{}"],
    ["an impossible date", JSON.stringify({ days: [{ date: "2026-02-31" }] })],
    ["an entry with no food", JSON.stringify({ days: [{ date: "2026-09-01", entries: [{ kcal: 100 }] }] })],
    ["a negative macro", JSON.stringify({ days: [{ date: "2026-09-01", entries: [{ food: "A", kcal: -5 }] }] })],
  ])("rejects %s", (_name, text) => {
    const result = parseHistoryFile(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("says where the problem is", () => {
    const result = parseHistoryFile(JSON.stringify({ days: [{ date: "2026-02-31" }] }));
    if (result.ok) throw new Error("Expected an error");
    expect(result.errors[0]).toContain("days.0.date");
  });
});

describe("importHistory", () => {
  it("saves entries, weights and saved foods", async () => {
    const result = await importHistory(parsed());
    expect(result).toEqual({ entriesAdded: 4, entriesSkipped: 0, foodsAdded: 1, foodsSkipped: 0, weightsAdded: 2 });
    expect(await db.days.get("2026-09-01")).toMatchObject({ weightKg: 78.5 });
    expect((await db.customFoods.toArray())[0]).toMatchObject({
      name: "Acme protein bar",
      servingG: 60,
      per100g: { kcal: 400, protein: 35 },
    });
  });

  it("infers raw or cooked only from the name", async () => {
    await importHistory(parsed());
    const entries = await db.entries.where("date").equals("2026-09-01").sortBy("timestamp");
    expect(entries.map((entry) => entry.rawOrCooked)).toEqual(["raw", "cooked", null]);
  });

  it("keeps missing macros missing and normalizes meals", async () => {
    await importHistory(parsed());
    const entries = await db.entries.where("date").equals("2026-09-01").sortBy("timestamp");
    expect(entries[0]).toMatchObject({ fat: null, meal: null, source: "imported" });
    expect(entries[1].meal).toBe("lunch");
    expect(entries[2]).toMatchObject({ grams: null, estimate: true, meal: "dinner" });
  });

  it("creates no duplicates when imported twice", async () => {
    await importHistory(parsed());
    const second = await importHistory(parsed());
    expect(second).toEqual({ entriesAdded: 0, entriesSkipped: 4, foodsAdded: 0, foodsSkipped: 1, weightsAdded: 0 });
    expect(await db.entries.count()).toBe(4);
    expect(await db.customFoods.count()).toBe(1);
  });

  it("keeps two identical foods on the same day", async () => {
    const twice = { days: [{ date: "2026-09-01", entries: [{ food: "Apple", kcal: 80 }, { food: "Apple", kcal: 80 }] }] };
    await importHistory(parsed(twice));
    expect(await db.entries.count()).toBe(2);
  });

  it("doesn't overwrite a weight logged in the app", async () => {
    await logWeight(95, "2026-09-01");
    await importHistory(parsed());
    expect((await db.days.get("2026-09-01"))?.weightKg).toBe(95);
  });

  it("makes imported foods searchable, saved foods first", async () => {
    await importHistory(parsed());
    const saved = await searchFood("Acme bar", async () => ({ available: true, foods: [] }));
    expect(saved.results[0]).toMatchObject({ source: "saved", name: "Acme protein bar" });

    const history = await searchFood("chicken breast", async () => ({ available: true, foods: [] }));
    expect(history.results[0]).toMatchObject({ source: "history", raw_or_cooked: "raw", times_logged: 2 });
    expect(history.results[0].per_100g?.kcal).toBe(110);
  });
});

describe("quick add and copying", () => {
  it("ranks foods by how often they're logged", async () => {
    await importHistory(parsed());
    const foods = await findFrequentFoods(2);
    expect(foods).toHaveLength(2);
    expect(foods[0]).toMatchObject({ label: "Chicken breast (raw weight)", count: 2, lastGrams: 300 });
  });

  it("copies entries onto a pending card without saving them", async () => {
    await importHistory(parsed());
    const entries = await db.entries.where("date").equals("2026-09-01").toArray();
    const id = await createProposal("2026-09-04", "dinner", entriesToCardItems(entries));
    expect(await db.entries.where("date").equals("2026-09-04").count()).toBe(0);

    await confirmProposal(id);
    const copied = await db.entries.where("date").equals("2026-09-04").toArray();
    expect(copied).toHaveLength(3);
    expect(copied.find((entry) => entry.food === "Beef shawarma saj")).toMatchObject({ estimate: true, kcal: 700, source: "history" });
  });

  it("undoes a whole confirmed log, and each removal can be reversed", async () => {
    await importHistory(parsed());
    const entries = await db.entries.where("date").equals("2026-09-01").toArray();
    const id = await createProposal("2026-09-04", null, entriesToCardItems(entries));
    await confirmProposal(id);

    await undoProposal(id);
    expect(await db.entries.where("date").equals("2026-09-04").count()).toBe(0);

    const changes = await db.changes.toArray();
    expect(changes).toHaveLength(3);
    await undoChange(changes[0].id);
    expect(await db.entries.where("date").equals("2026-09-04").count()).toBe(1);
  });
});
