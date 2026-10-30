import type { z } from "zod";
import { dayKey } from "../dates";
import { db, type Entry, type FoodLookup, type Proposal, type ProposalItem } from "../db";
import { entryLookup, searchFood, type UsdaSearcher } from "../food/search";
import {
  deleteEntry,
  editEntry,
  logWeight,
  markDayIncomplete,
  saveCustomFood,
  setGoals,
} from "../log";
import { sumMacros } from "../macros";
import { resolveItem } from "./proposal";
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
  if (ref.startsWith("entry:")) {
    const entry = await db.entries.get(ref.slice("entry:".length));
    return entry ? entryLookup(entry) : null;
  }
  return (await db.foodLookups.get(ref)) ?? null;
}

async function proposeLog(input: ToolInput<"propose_log">, day: string): Promise<ToolResult> {
  const items: ProposalItem[] = [];
  const errors: string[] = [];
  for (const itemInput of input.items) {
    const result = resolveItem(itemInput, await getLookup(itemInput.ref));
    if (result.ok) items.push(result.item);
    else errors.push(result.error);
  }
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
