import { shiftDate } from "../dates";
import { db, type Entry, type Macros, type Proposal } from "../db";
import { GOALS_KEY } from "../log";
import { MACRO_KEYS, sumMacros } from "../macros";

const BACKGROUND_DAYS = 7;

function formatValue(value: number | null, unit: string): string {
  return value === null ? `?${unit}` : `${value}${unit}`;
}

function formatMacros(macros: Macros): string {
  return `${formatValue(macros.kcal, " kcal")}, P ${formatValue(macros.protein, "g")}, C ${formatValue(macros.carbs, "g")}, F ${formatValue(macros.fat, "g")}`;
}

function formatAmount(item: { grams: number | null; rawOrCooked: string | null; portion?: string | null }): string {
  const parts = [
    item.grams === null ? "no weight" : `${item.grams} g`,
    item.rawOrCooked,
    item.portion,
  ];
  return parts.filter(Boolean).join(" ");
}

function formatEntry(entry: Entry): string {
  const flags = [entry.meal, entry.source, entry.estimate ? "estimate" : null].filter(Boolean).join(", ");
  return `- id=${entry.id} | ${entry.food} | ${formatAmount(entry)} | ${formatMacros(entry)} | ${flags}`;
}

function formatTotals(entries: Entry[]): string {
  const totals = sumMacros(entries);
  return MACRO_KEYS.map(
    (key) => `${key} ${totals[key].value}${totals[key].partial ? " (partial)" : ""}`,
  ).join(", ");
}

function formatCard(card: Proposal): string {
  const items = card.items
    .map((item) => `  - ${item.food} | ${formatAmount(item)} | ${formatMacros(item)}`)
    .join("\n");
  return `- card_id=${card.id} for ${card.date}${card.meal ? ` (${card.meal})` : ""}:\n${items}`;
}

async function getGoals(): Promise<Macros | null> {
  return ((await db.settings.get(GOALS_KEY))?.value as Macros | undefined) ?? null;
}

// Sent with every message: the time, today so far, and open cards.
export async function buildTurnContext(day: string, now: Date): Promise<string> {
  const entries = await db.entries.where("date").equals(day).sortBy("timestamp");
  const weight = (await db.days.get(day))?.weightKg ?? null;
  const pending = await db.proposals
    .where("day")
    .equals(day)
    .filter((proposal) => proposal.status === "pending")
    .toArray();
  const changes = await db.changes.where("day").equals(day).sortBy("createdAt");

  return [
    `Current time: ${now.toLocaleString("en-CA", { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}`,
    `Logging day: ${day}`,
    `Weight today: ${weight === null ? "not logged" : `${weight} kg`}`,
    entries.length ? `Today's saved entries:\n${entries.map(formatEntry).join("\n")}` : "Today's saved entries: none",
    `Today's totals: ${formatTotals(entries)}`,
    pending.length ? `Cards awaiting confirmation:\n${pending.map(formatCard).join("\n")}` : "Cards awaiting confirmation: none",
    // He can also change things by tapping, which Claude wouldn't otherwise see.
    changes.length
      ? `Changes made today, oldest first, whether by you or by him tapping in the app:\n${changes.map((change) => `- ${change.label}${change.undone ? " (he then tapped Undo)" : ""}`).join("\n")}`
      : "Changes made today: none",
  ].join("\n");
}

// Goals, recent days and saved foods. Only re-sent when it changes.
export async function buildBackground(day: string): Promise<string> {
  const goals = await getGoals();
  const start = shiftDate(day, -BACKGROUND_DAYS);
  const recent = await db.entries.where("date").between(start, day, true, false).sortBy("timestamp");
  const recentDays = await db.days.where("date").between(start, day, true, false).toArray();
  const foods = await db.customFoods.orderBy("name").toArray();
  const meals = await db.meals.orderBy("name").toArray();

  const history: string[] = [];
  for (let offset = BACKGROUND_DAYS; offset >= 1; offset--) {
    const date = shiftDate(day, -offset);
    const entries = recent.filter((entry) => entry.date === date);
    const dayRecord = recentDays.find((record) => record.date === date);
    const notes = [
      dayRecord?.weightKg != null ? `weight ${dayRecord.weightKg} kg` : null,
      dayRecord?.incomplete ? "incomplete" : null,
    ].filter(Boolean);
    const foodNames = entries.map((entry) => entry.food).join("; ");
    history.push(
      entries.length
        ? `- ${date}: ${formatTotals(entries)}${notes.length ? ` | ${notes.join(", ")}` : ""} | ${foodNames}`
        : `- ${date}: nothing logged${notes.length ? ` | ${notes.join(", ")}` : ""}`,
    );
  }

  return [
    `Daily goals: ${goals ? formatMacros(goals) : "not set"}`,
    `Last ${BACKGROUND_DAYS} days:\n${history.join("\n")}`,
    foods.length
      ? `Saved foods (per 100 g):\n${foods.map((food) => `- ${food.name}: ${formatMacros(food.per100g)}${food.servingG ? ` | serving ${food.servingG} g` : ""}`).join("\n")}`
      : "Saved foods: none",
    meals.length
      ? `Saved meals:\n${meals.map((meal) => `- ${meal.name}: ${meal.items.map((item) => item.food).join("; ")}`).join("\n")}`
      : "Saved meals: none",
  ].join("\n");
}

export function wrapAppContext(turn: string, background: string | null): string {
  const backgroundBlock = background === null ? "" : `\n<background>\n${background}\n</background>`;
  return `<app_context>\n${turn}${backgroundBlock}\n</app_context>`;
}
