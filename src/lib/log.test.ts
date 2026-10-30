import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import { buildBackground, buildTurnContext, wrapAppContext } from "./chat/context";
import { executeTool } from "./chat/tools";
import { TOOLS, buildToolDefinitions } from "./chat/toolDefs";
import { db, type Entry, type Proposal, type ProposalItem } from "./db";
import { searchFood, type UsdaSearcher } from "./food/search";
import {
  cancelProposal,
  confirmProposal,
  deleteEntry,
  editEntry,
  editPendingItem,
  logWeight,
  removePendingItem,
  undoChange,
} from "./log";

const DAY = "2026-10-30";

function item(overrides: Partial<ProposalItem> = {}): ProposalItem {
  return {
    id: crypto.randomUUID(),
    food: "Chicken breast",
    grams: 200,
    rawOrCooked: "raw",
    portion: null,
    source: "usda",
    estimate: false,
    kcal: 240,
    protein: 45,
    carbs: 0,
    fat: 5.2,
    ...overrides,
  };
}

async function addProposal(items: ProposalItem[] = [item()], overrides: Partial<Proposal> = {}): Promise<string> {
  const id = crypto.randomUUID();
  await db.proposals.add({ id, day: DAY, date: DAY, createdAt: 1, status: "pending", meal: null, items, ...overrides });
  return id;
}

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: crypto.randomUUID(),
    date: DAY,
    food: "Chicken breast",
    grams: 200,
    rawOrCooked: "raw",
    kcal: 240,
    protein: 45,
    carbs: 0,
    fat: 5.2,
    meal: null,
    estimate: false,
    source: "usda",
    timestamp: 1,
    ...overrides,
  };
}

const noUsda: UsdaSearcher = async () => ({ available: true, foods: [] });

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("database upgrade", () => {
  it("keeps version 1 data when upgrading to version 2", async () => {
    db.close();
    await Dexie.delete("cmac");

    const old = new Dexie("cmac");
    old.version(1).stores({
      entries: "id, date, timestamp, food",
      days: "date",
      customFoods: "id, name",
      meals: "id, name",
      batches: "id, name, expiresAt",
      settings: "key",
      chatMessages: "id, createdAt",
    });
    await old.open();
    await old.table("entries").add(entry({ id: "old-entry" }));
    await old.table("days").add({ date: DAY, weightKg: 78.5, incomplete: false });
    old.close();

    await db.open();
    expect(await db.entries.get("old-entry")).toMatchObject({ food: "Chicken breast", kcal: 240 });
    expect(await db.days.get(DAY)).toMatchObject({ weightKg: 78.5 });
    expect(await db.proposals.count()).toBe(0);
    expect(await db.chatMessages.where("day").equals(DAY).count()).toBe(0);
  });
});

describe("confirm cards", () => {
  it("saves nothing until confirmed", async () => {
    await addProposal();
    expect(await db.entries.count()).toBe(0);
  });

  it("saves all items once, however many times Confirm is tapped", async () => {
    const id = await addProposal([item(), item({ food: "Potatoes" })], { meal: "lunch" });
    const results = await Promise.all([confirmProposal(id), confirmProposal(id), confirmProposal(id)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await db.entries.count()).toBe(2);
    expect((await db.entries.toArray())[0]).toMatchObject({ date: DAY, meal: "lunch" });
    expect((await db.proposals.get(id))?.status).toBe("confirmed");
  });

  it("won't save a cancelled or replaced card", async () => {
    const cancelled = await addProposal();
    await cancelProposal(cancelled);
    const replaced = await addProposal([item()], { status: "replaced" });
    expect(await confirmProposal(cancelled)).toBe(false);
    expect(await confirmProposal(replaced)).toBe(false);
    expect(await db.entries.count()).toBe(0);
  });

  it("rescales a pending item when its grams change", async () => {
    const chicken = item();
    const id = await addProposal([chicken]);
    await editPendingItem(id, chicken.id, { grams: 100 });
    expect((await db.proposals.get(id))?.items[0]).toMatchObject({ grams: 100, kcal: 120, protein: 22.5 });
  });

  it("cancels the card when its last item is removed", async () => {
    const chicken = item();
    const id = await addProposal([chicken]);
    await removePendingItem(id, chicken.id);
    expect((await db.proposals.get(id))?.status).toBe("cancelled");
  });
});

describe("editing saved entries", () => {
  it("rescales and restores exactly on Undo", async () => {
    const original = entry({ portion: "1 × medium" });
    await db.entries.add(original);
    await editEntry(original.id, { grams: 100 });
    expect(await db.entries.get(original.id)).toMatchObject({ grams: 100, kcal: 120, portion: null });

    const [change] = await db.changes.toArray();
    expect(await undoChange(change.id)).toBe(true);
    expect(await db.entries.get(original.id)).toEqual(original);
  });

  it("restores a removed entry exactly", async () => {
    const original = entry();
    await db.entries.add(original);
    await deleteEntry(original.id);
    expect(await db.entries.get(original.id)).toBeUndefined();

    const [change] = await db.changes.toArray();
    await undoChange(change.id);
    expect(await db.entries.get(original.id)).toEqual(original);
  });

  it("can't undo twice", async () => {
    const original = entry();
    await db.entries.add(original);
    await deleteEntry(original.id);
    const [change] = await db.changes.toArray();
    expect(await undoChange(change.id)).toBe(true);
    expect(await undoChange(change.id)).toBe(false);
  });

  it("won't let an old Undo wipe out a newer change", async () => {
    const original = entry();
    await db.entries.add(original);
    await editEntry(original.id, { grams: 100 });
    const [first] = await db.changes.toArray();
    await editEntry(original.id, { grams: 50 });
    expect(await undoChange(first.id)).toBe(false);
    expect((await db.entries.get(original.id))?.grams).toBe(50);
  });

  it("undoes a first weight log by removing it", async () => {
    await logWeight(78.8, DAY);
    const [change] = await db.changes.toArray();
    await undoChange(change.id);
    expect(await db.days.get(DAY)).toBeUndefined();
  });
});

describe("search_food", () => {
  it("lists saved foods, then past logs, then USDA", async () => {
    await db.customFoods.add({
      id: "c1",
      name: "Chicken special",
      per100g: { kcal: 150, protein: 25, carbs: 0, fat: 5 },
      servingG: null,
      createdAt: 1,
    });
    await db.entries.add(entry());
    const result = await searchFood("chicken", async () => ({
      available: true,
      foods: [
        {
          fdcId: 9,
          name: "Chicken, raw",
          dataType: "SR Legacy",
          per100g: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6 },
          portions: [],
        },
      ],
    }));
    expect(result.results.map((food) => food.source)).toEqual(["saved", "history", "usda"]);
  });

  it("calculates per 100 g from your past logs and counts repeats", async () => {
    await db.entries.bulkAdd([entry(), entry({ timestamp: 2 })]);
    const { results } = await searchFood("chicken breasts raw", noUsda);
    expect(results[0]).toMatchObject({ source: "history", times_logged: 2 });
    expect(results[0].per_100g).toEqual({ kcal: 120, protein: 22.5, carbs: 0, fat: 2.6 });
  });

  it("returns your numbers per portion for an unweighed meal", async () => {
    await db.entries.add(entry({ food: "Beef shawarma saj", grams: null, rawOrCooked: null, kcal: 700, estimate: true }));
    const { results } = await searchFood("shawarma", noUsda);
    expect(results[0]).toMatchObject({ per_100g: null, estimate: true });
    expect(results[0].per_portion?.kcal).toBe(700);
  });

  it("still works when USDA is down", async () => {
    await db.entries.add(entry());
    const result = await searchFood("chicken", async () => {
      throw new Error("network");
    });
    expect(result.results).toHaveLength(1);
    expect(result.note).toContain("unavailable");
  });

  it("matches plurals", async () => {
    await db.entries.add(entry({ food: "Tomatoes" }));
    expect((await searchFood("tomato", noUsda)).results).toHaveLength(1);
  });
});

describe("tools", () => {
  it("runs search then propose, with macros calculated from the ref", async () => {
    await executeTool(
      "search_food",
      { query: "chicken" },
      async () => ({
        available: true,
        foods: [
          {
            fdcId: 9,
            name: "Chicken, raw",
            dataType: "SR Legacy",
            per100g: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6 },
            portions: [],
          },
        ],
      }),
      DAY,
    );
    const result = await executeTool(
      "propose_log",
      { items: [{ food: "Chicken breast", kind: "lookup", ref: "usda:9", grams: 350, raw_or_cooked: "raw" }] },
      noUsda,
      DAY,
    );
    expect(result.isError).toBe(false);
    expect((await db.proposals.toArray())[0].items[0]).toMatchObject({ kcal: 420, protein: 78.8 });
    expect(await db.entries.count()).toBe(0);
  });

  it("shows no card if any item fails", async () => {
    const result = await executeTool(
      "propose_log",
      { items: [{ food: "Chicken", kind: "lookup", ref: "usda:404", grams: 100 }] },
      noUsda,
      DAY,
    );
    expect(result.isError).toBe(true);
    expect(await db.proposals.count()).toBe(0);
  });

  it("replaces a pending card", async () => {
    const old = await addProposal();
    await executeTool(
      "propose_log",
      {
        items: [{ food: "Bar", kind: "user_number", numbers: { kcal: 210, protein: 20, carbs: null, fat: null } }],
        replaces_card_id: old,
      },
      noUsda,
      DAY,
    );
    expect((await db.proposals.get(old))?.status).toBe("replaced");
    expect(await db.proposals.count()).toBe(2);
  });

  it("repeats a past entry exactly from its ref", async () => {
    const past = entry({ date: "2026-10-29", meal: "breakfast", portion: null });
    await db.entries.add(past);
    const result = await executeTool(
      "propose_log",
      { items: [{ food: past.food, kind: "lookup", ref: `entry:${past.id}` }], meal: "breakfast" },
      noUsda,
      DAY,
    );
    expect(result.isError).toBe(false);
    expect((await db.proposals.toArray())[0].items[0]).toMatchObject({
      grams: 200,
      kcal: 240,
      protein: 45,
      fat: 5.2,
      rawOrCooked: "raw",
      source: "history",
    });
  });

  it("returns invalid input to the model as an error", async () => {
    const result = await executeTool("log_weight", { kg: "lots" }, noUsda, DAY);
    expect(result).toMatchObject({ isError: true });
    expect(result.content).toContain("Invalid input");
  });

  it("rejects an impossible weight", async () => {
    expect((await executeTool("log_weight", { kg: 5000 }, noUsda, DAY)).isError).toBe(true);
    expect(await db.days.count()).toBe(0);
  });

  it("reports an unknown tool", async () => {
    expect((await executeTool("launch_rocket", {}, noUsda, DAY)).isError).toBe(true);
  });

  it("edits through the tool using snake_case fields", async () => {
    const original = entry();
    await db.entries.add(original);
    const result = await executeTool(
      "edit_entry",
      { id: original.id, changes: { grams: 300, raw_or_cooked: "cooked" } },
      noUsda,
      DAY,
    );
    expect(result.isError).toBe(false);
    expect(await db.entries.get(original.id)).toMatchObject({ grams: 300, rawOrCooked: "cooked", kcal: 360 });
  });

  it("reports totals as partial when a macro is missing", async () => {
    await db.entries.bulkAdd([entry(), entry({ fat: null })]);
    const { content } = await executeTool("get_day", { date: DAY }, noUsda, DAY);
    expect(JSON.parse(content).totals.fat).toEqual({ value: 5.2, partial: true });
  });

  it("builds a valid definition for every tool", () => {
    const definitions = buildToolDefinitions();
    expect(definitions.map((tool) => tool.name)).toEqual(Object.keys(TOOLS));
    for (const definition of definitions) {
      expect(definition.input_schema.type).toBe("object");
      expect(definition.input_schema).not.toHaveProperty("$schema");
    }
  });
});

describe("context", () => {
  it("shows today's entries with ids and pending cards", async () => {
    const saved = entry();
    await db.entries.add(saved);
    const cardId = await addProposal();
    const context = await buildTurnContext(DAY, new Date(2026, 9, 30, 19, 42));
    expect(context).toContain(`id=${saved.id}`);
    expect(context).toContain(`card_id=${cardId}`);
    expect(context).toContain("Logging day: 2026-10-30");
  });

  it("marks a partial total", async () => {
    await db.entries.add(entry({ fat: null }));
    expect(await buildTurnContext(DAY, new Date())).toContain("fat 0 (partial)");
  });

  it("includes only the 7 days before today in the background", async () => {
    await db.entries.bulkAdd([
      entry({ date: "2026-10-29", food: "Yesterday food" }),
      entry({ date: "2026-10-23", food: "Oldest food" }),
      entry({ date: "2026-10-22", food: "Too old food" }),
      entry({ date: DAY, food: "Today food" }),
    ]);
    const background = await buildBackground(DAY);
    expect(background).toContain("Yesterday food");
    expect(background).toContain("Oldest food");
    expect(background).not.toContain("Too old food");
    expect(background).not.toContain("Today food");
  });

  it("leaves the background out when there's none to send", () => {
    expect(wrapAppContext("turn", null)).not.toContain("<background>");
    expect(wrapAppContext("turn", "goals")).toContain("<background>\ngoals\n</background>");
  });
});
