import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildBackup, isBackupFile, markBackupDone, parseBackup, restoreBackup } from "./backup";
import { db, type Entry } from "./db";
import {
  deleteCustomFood,
  deleteMeal,
  GOALS_KEY,
  LAST_BACKUP_KEY,
  renameCustomFood,
  renameMeal,
  saveCustomFood,
  setGoals,
  undoChange,
} from "./log";

function entry(id: string, overrides: Partial<Entry> = {}): Entry {
  return {
    id,
    date: "2026-10-30",
    food: "Chicken",
    grams: 200,
    rawOrCooked: "raw",
    kcal: 240,
    protein: 45,
    carbs: 0,
    fat: null,
    meal: "lunch",
    estimate: false,
    source: "usda",
    timestamp: 1,
    ...overrides,
  };
}

const roundTrip = async () => JSON.parse(JSON.stringify(await buildBackup()));

async function clearAllData() {
  await db.delete();
  await db.open();
}

beforeEach(clearAllData);

describe("backup and restore", () => {
  it("restores everything exactly after the data is lost", async () => {
    const original = entry("a", { nutrients: { fibre: 3 } });
    await db.entries.add(original);
    await db.days.add({ date: "2026-10-30", weightKg: 78.5, incomplete: true });
    await saveCustomFood("Acme bar", { kcal: 400, protein: 35, carbs: 36.7, fat: 15 }, 60);
    await db.meals.add({ id: "m", name: "Usual", items: [] });
    await setGoals({ kcal: 2200, protein: 180, carbs: 200, fat: 70 });
    const food = await db.customFoods.toArray();

    const backup = await roundTrip();
    await clearAllData();
    expect(await db.entries.count()).toBe(0);

    const parsed = parseBackup(backup);
    if (!parsed.ok) throw new Error(parsed.errors.join());
    await restoreBackup(parsed.backup);

    expect(await db.entries.get("a")).toEqual(original);
    expect(await db.days.get("2026-10-30")).toMatchObject({ weightKg: 78.5, incomplete: true });
    expect(await db.customFoods.toArray()).toEqual(food);
    expect((await db.settings.get(GOALS_KEY))?.value).toMatchObject({ kcal: 2200 });
  });

  it("doesn't include chats or the backup date", async () => {
    await db.chatMessages.add({ id: "c", day: "2026-10-30", createdAt: 1, role: "user", content: "hi" });
    await markBackupDone();
    const backup = await roundTrip();
    expect(backup).not.toHaveProperty("chatMessages");
    expect(backup.settings.map((setting: { key: string }) => setting.key)).not.toContain(LAST_BACKUP_KEY);
  });

  it("never overwrites newer data", async () => {
    await db.entries.add(entry("a", { grams: 200 }));
    const backup = await roundTrip();
    await db.entries.update("a", { grams: 300 });
    await db.entries.add(entry("b"));

    const parsed = parseBackup(backup);
    if (!parsed.ok) throw new Error(parsed.errors.join());
    expect(await restoreBackup(parsed.backup)).toEqual({ added: 0, skipped: 1 });
    expect((await db.entries.get("a"))?.grams).toBe(300);
    expect(await db.entries.count()).toBe(2);
  });

  it("recognizes a backup and rejects a damaged one", async () => {
    expect(isBackupFile({ app: "cmac" })).toBe(true);
    expect(isBackupFile({ days: [] })).toBe(false);
    const result = parseBackup({ app: "cmac", version: 1, exportedAt: 1, entries: [{ food: "No id" }] });
    expect(result.ok).toBe(false);
  });
});

describe("saved foods and meals", () => {
  it("renames a saved food without changing its numbers", async () => {
    const food = await saveCustomFood("Acme bar", { kcal: 400, protein: 35, carbs: 36.7, fat: 15 }, 60);
    await renameCustomFood(food.id, "Acme protein bar");
    expect(await db.customFoods.get(food.id)).toMatchObject({ name: "Acme protein bar", per100g: { kcal: 400 } });
  });

  it("deletes a saved food with Undo", async () => {
    const food = await saveCustomFood("Acme bar", { kcal: 400, protein: 35, carbs: 36.7, fat: 15 }, 60);
    await deleteCustomFood(food.id);
    expect(await db.customFoods.count()).toBe(0);
    const change = await db.changes.orderBy("createdAt").last();
    expect(await undoChange(change?.id ?? "")).toBe(true);
    expect(await db.customFoods.get(food.id)).toEqual(food);
  });

  it("renames and deletes a saved meal with Undo", async () => {
    await db.meals.add({ id: "m", name: "Usual", items: [] });
    await renameMeal("m", "Usual breakfast");
    expect((await db.meals.get("m"))?.name).toBe("Usual breakfast");
    await deleteMeal("m");
    expect(await db.meals.count()).toBe(0);
    const changes = await db.changes.toArray();
    const removal = changes.find((change) => change.label.startsWith("Removed"));
    await undoChange(removal?.id ?? "");
    expect((await db.meals.get("m"))?.name).toBe("Usual breakfast");
  });
});
