import type { z } from "zod";
import { dayKey } from "../dates";
import { db, type Batch, type Entry, type FoodLookup, type Proposal, type ProposalItem } from "../db";
import { batchLookup, buildBatch, isBatchActive, per100gCooked } from "../food/batch";
import { entryLookup, searchFood, type UsdaSearcher } from "../food/search";
import {
  deleteEntry,
  editEntry,
  logWeight,
  markDayIncomplete,
  saveBatch,
  saveCustomFood,
  saveMeal,
  setGoals,
} from "../log";
import { sumMacros } from "../macros";
import { estimateFromBody, estimateFromHistory, USER_PROFILE } from "../maintenance";
import { resolveLabelFood } from "./labelFood";
import { resolveItem, type ProposedItemInput } from "./proposal";
import { TOOLS, type ToolName } from "./toolDefs";

export type ToolResult = { content: string; isError: boolean };

type ToolInput<Name extends ToolName> = z.infer<(typeof TOOLS)[Name]["schema"]>;

const MAX_HISTORY_DAYS = 120;

function describeEntry(entry: Entry) {
  return {
    id: entry.id,
    ref: `entry:${entry.id}`,
    food: entry.food,
    grams: entry.grams,
    raw_or_cooked: entry.rawOrCooked,
    kcal: entry.kcal,
    protein: entry.protein,
    carbs: entry.carbs,
    fat: entry.fat,
    meal: entry.meal,
    estimate: entry.estimate,
    source: entry.source,
  };
}

async function getLookup(ref: string | null | undefined): Promise<FoodLookup | null> {
  if (!ref) return null;
  if (ref.startsWith("batch:")) {
    const batch = await db.batches.get(ref.slice("batch:".length));
    return batch && isBatchActive(batch, Date.now()) ? batchLookup(batch) : null;
  }
  if (ref.startsWith("entry:")) {
    const entry = await db.entries.get(ref.slice("entry:".length));
    return entry ? entryLookup(entry) : null;
  }
  return (await db.foodLookups.get(ref)) ?? null;
}

async function proposeLog(input: ToolInput<"propose_log">, day: string): Promise<ToolResult> {
  const { items, errors } = await resolveItems(input.items);
  if (errors.length > 0) {
    return { content: `No card was shown. Fix these and try again:\n${errors.join("\n")}`, isError: true };
  }

  const card: Proposal = {
    id: crypto.randomUUID(),
    day,
    createdAt: Date.now(),
    status: "pending",
    date: input.date ?? day,
    meal: input.meal ?? null,
    items,
  };

  await db.transaction("rw", db.proposals, async () => {
    if (input.replaces_card_id) {
      const old = await db.proposals.get(input.replaces_card_id);
      if (old?.status === "pending") await db.proposals.update(old.id, { status: "replaced" });
    }
    await db.proposals.add(card);
  });

  return {
    content: JSON.stringify({
      card_id: card.id,
      status: "shown to the user, not saved until they tap Confirm",
      items: items.map(({ food, grams, rawOrCooked, portion, kcal, protein, carbs, fat, estimate }) => ({
        food,
        grams,
        raw_or_cooked: rawOrCooked,
        portion,
        kcal,
        protein,
        carbs,
        fat,
        estimate,
      })),
      totals: sumMacros(items),
    }),
    isError: false,
  };
}

async function getDay(date: string): Promise<ToolResult> {
  const entries = await db.entries.where("date").equals(date).sortBy("timestamp");
  const record = await db.days.get(date);
  return {
    content: JSON.stringify({
      date,
      weight_kg: record?.weightKg ?? null,
      incomplete: record?.incomplete ?? false,
      entries: entries.map(describeEntry),
      totals: sumMacros(entries),
    }),
    isError: false,
  };
}

async function getHistory(start: string, end: string): Promise<ToolResult> {
  if (start > end) return { content: "start must not be after end.", isError: true };

  const entries = await db.entries.where("date").between(start, end, true, true).toArray();
  const days = await db.days.where("date").between(start, end, true, true).toArray();
  const dates = [...new Set([...entries.map((entry) => entry.date), ...days.map((day) => day.date)])]
    .sort()
    .slice(-MAX_HISTORY_DAYS);

  return {
    content: JSON.stringify({
      days: dates.map((date) => {
        const record = days.find((day) => day.date === date);
        return {
          date,
          weight_kg: record?.weightKg ?? null,
          incomplete: record?.incomplete ?? false,
          totals: sumMacros(entries.filter((entry) => entry.date === date)),
        };
      }),
    }),
    isError: false,
  };
}

async function runEditEntry({ id, changes }: ToolInput<"edit_entry">): Promise<ToolResult> {
  const { raw_or_cooked: rawOrCooked, ...rest } = changes;
  const edited = await editEntry(id, {
    ...rest,
    ...(rawOrCooked === undefined ? {} : { rawOrCooked }),
  });
  if (!edited) return { content: `No entry with id ${id}.`, isError: true };
  return { content: JSON.stringify({ edited: describeEntry(edited) }), isError: false };
}

async function resolveItems(inputs: ProposedItemInput[]): Promise<{ items: ProposalItem[]; errors: string[] }> {
  const items: ProposalItem[] = [];
  const errors: string[] = [];
  for (const input of inputs) {
    const result = resolveItem(input, await getLookup(input.ref));
    if (result.ok) items.push(result.item);
    else errors.push(result.error);
  }
  return { items, errors };
}

async function proposeLabelFood(input: ToolInput<"propose_label_food">, day: string): Promise<ToolResult> {
  const resolved = resolveLabelFood(input);
  if (!resolved.ok) return { content: resolved.error, isError: true };

  const id = crypto.randomUUID();
  await db.transaction("rw", db.foodCards, async () => {
    if (input.replaces_card_id) {
      const old = await db.foodCards.get(input.replaces_card_id);
      if (old?.status === "pending") await db.foodCards.update(old.id, { status: "replaced" });
    }
    await db.foodCards.add({ id, day, createdAt: Date.now(), status: "pending", ...resolved.food });
  });
  return {
    content: JSON.stringify({ card_id: id, status: "shown to him, not saved until he taps Save", ...resolved.food }),
    isError: false,
  };
}

async function runSaveMeal({ name, items: inputs }: ToolInput<"save_meal">): Promise<ToolResult> {
  const { items, errors } = await resolveItems(inputs);
  if (errors.length > 0) {
    return { content: `The meal wasn't saved. Fix these and try again:\n${errors.join("\n")}`, isError: true };
  }
  const meal = await saveMeal(
    name,
    items.map(({ food, grams, rawOrCooked, kcal, protein, carbs, fat }) => ({ food, grams, rawOrCooked, kcal, protein, carbs, fat })),
  );
  return { content: JSON.stringify({ saved: meal.name, items: meal.items, totals: sumMacros(meal.items) }), isError: false };
}

async function showSavedMeal({ name, meal, date }: ToolInput<"use_saved_meal">, day: string): Promise<ToolResult> {
  const saved = await db.meals.where("name").equalsIgnoreCase(name).first();
  if (!saved) return { content: `No saved meal called "${name}".`, isError: true };

  const card: Proposal = {
    id: crypto.randomUUID(),
    day,
    createdAt: Date.now(),
    status: "pending",
    date: date ?? day,
    meal: meal ?? null,
    items: saved.items.map((item) => ({ ...item, id: crypto.randomUUID(), portion: null, source: "saved", estimate: false })),
  };
  await db.proposals.add(card);
  return {
    content: JSON.stringify({ card_id: card.id, status: "shown to him, not saved until he taps Confirm", totals: sumMacros(card.items) }),
    isError: false,
  };
}

async function createBatch({ name, raw_g: rawG, cooked_g: cookedG, ref }: ToolInput<"create_batch">): Promise<ToolResult> {
  const lookup = await getLookup(ref);
  if (!lookup) return { content: `Unknown ref "${ref}". Call search_food first.`, isError: true };
  const result = buildBatch({ name, rawG, cookedG }, lookup, Date.now());
  if (!result.ok) return { content: result.error, isError: true };
  await saveBatch(result.batch);
  return {
    content: JSON.stringify({
      ref: `batch:${result.batch.id}`,
      name,
      per_100g_cooked: roundedPer100g(result.batch),
      expires: new Date(result.batch.expiresAt as number).toDateString(),
    }),
    isError: false,
  };
}

function roundedPer100g(batch: Batch) {
  const values = per100gCooked(batch);
  const round = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);
  return { kcal: round(values.kcal), protein: round(values.protein), carbs: round(values.carbs), fat: round(values.fat) };
}

async function listBatches(): Promise<ToolResult> {
  const batches = (await db.batches.toArray()).filter((batch) => isBatchActive(batch, Date.now()));
  return {
    content: JSON.stringify({
      batches: batches.map((batch) => ({
        ref: `batch:${batch.id}`,
        name: batch.name,
        raw_g: batch.rawG,
        cooked_g: batch.cookedG,
        per_100g_cooked: roundedPer100g(batch),
        expires: new Date(batch.expiresAt as number).toDateString(),
      })),
    }),
    isError: false,
  };
}

async function estimateMaintenance(day: string): Promise<ToolResult> {
  const [entries, days] = await Promise.all([db.entries.toArray(), db.days.toArray()]);
  return {
    content: JSON.stringify({
      from_history: estimateFromHistory(entries, days, day),
      from_body: estimateFromBody(days),
      profile: USER_PROFILE,
    }),
    isError: false,
  };
}

async function runTool(
  name: ToolName,
  input: ToolInput<ToolName>,
  day: string,
  searchUsda: UsdaSearcher,
): Promise<ToolResult> {
  const ok = (value: unknown): ToolResult => ({ content: JSON.stringify(value), isError: false });

  switch (name) {
    case "search_food": {
      const { query } = input as ToolInput<"search_food">;
      return ok(await searchFood(query, searchUsda));
    }
    case "propose_log":
      return proposeLog(input as ToolInput<"propose_log">, day);
    case "get_day":
      return getDay((input as ToolInput<"get_day">).date);
    case "get_history": {
      const { start, end } = input as ToolInput<"get_history">;
      return getHistory(start, end);
    }
    case "edit_entry":
      return runEditEntry(input as ToolInput<"edit_entry">);
    case "delete_entry": {
      const { id } = input as ToolInput<"delete_entry">;
      const removed = await deleteEntry(id);
      return removed
        ? ok({ removed: removed.food })
        : { content: `No entry with id ${id}.`, isError: true };
    }
    case "log_weight": {
      const { kg, date } = input as ToolInput<"log_weight">;
      await logWeight(kg, date ?? day);
      return ok({ logged_kg: kg, date: date ?? day });
    }
    case "set_goals": {
      const goals = input as ToolInput<"set_goals">;
      await setGoals(goals);
      return ok({ goals });
    }
    case "mark_day_incomplete": {
      const { date, incomplete } = input as ToolInput<"mark_day_incomplete">;
      await markDayIncomplete(date, incomplete);
      return ok({ date, incomplete });
    }
    case "save_custom_food": {
      const { name: foodName, per_100g: per100g, serving_g: servingG } = input as ToolInput<"save_custom_food">;
      const saved = await saveCustomFood(foodName, per100g, servingG ?? null);
      return ok({ saved: saved.name });
    }
    case "propose_label_food":
      return proposeLabelFood(input as ToolInput<"propose_label_food">, day);
    case "save_meal":
      return runSaveMeal(input as ToolInput<"save_meal">);
    case "use_saved_meal":
      return showSavedMeal(input as ToolInput<"use_saved_meal">, day);
    case "create_batch":
      return createBatch(input as ToolInput<"create_batch">);
    case "list_batches":
      return listBatches();
    case "estimate_maintenance":
      return estimateMaintenance(day);
  }
}

// Checks a tool call's input and runs it. Problems go back to Claude as errors
// so it can correct itself, rather than stopping the conversation.
export async function executeTool(
  name: string,
  rawInput: unknown,
  searchUsda: UsdaSearcher,
  day: string = dayKey(),
): Promise<ToolResult> {
  if (!(name in TOOLS)) return { content: `Unknown tool: ${name}`, isError: true };
  const toolName = name as ToolName;

  const parsed = TOOLS[toolName].schema.safeParse(rawInput);
  if (!parsed.success) {
    return { content: `Invalid input: ${parsed.error.message}`, isError: true };
  }

  try {
    return await runTool(toolName, parsed.data, day, searchUsda);
  } catch (error) {
    return { content: `The tool failed: ${String(error)}`, isError: true };
  }
}
