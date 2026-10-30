import { dayKey } from "./dates";
import {
  db,
  type ChangeRecord,
  type CustomFood,
  type Day,
  type Entry,
  type Macros,
  type ProposalItem,
} from "./db";
import { applyFoodEdit } from "./macros";

export const GOALS_KEY = "goals";

async function recordChange(
  change: Pick<ChangeRecord, "label" | "table" | "key" | "before" | "after">,
): Promise<void> {
  await db.changes.add({
    ...change,
    id: crypto.randomUUID(),
    day: dayKey(),
    createdAt: Date.now(),
    undone: false,
  });
}

// Saves a card's items as entries. A second tap, or a card that was already
// replaced or cancelled, saves nothing.
export async function confirmProposal(id: string): Promise<boolean> {
  return db.transaction("rw", db.proposals, db.entries, async () => {
    const proposal = await db.proposals.get(id);
    if (!proposal || proposal.status !== "pending" || proposal.items.length === 0) return false;

    const timestamp = Date.now();
    const items = proposal.items.map((item) => ({ ...item, entryId: crypto.randomUUID() }));
    const entries: Entry[] = items.map((item) => ({
      id: item.entryId,
      date: proposal.date,
      food: item.food,
      grams: item.grams,
      rawOrCooked: item.rawOrCooked,
      portion: item.portion,
      kcal: item.kcal,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
      meal: proposal.meal,
      estimate: item.estimate,
      source: item.source,
      timestamp,
    }));

    await db.entries.bulkAdd(entries);
    await db.proposals.update(id, { status: "confirmed", items });
    return true;
  });
}

export async function cancelProposal(id: string): Promise<void> {
  await db.transaction("rw", db.proposals, async () => {
    const proposal = await db.proposals.get(id);
    if (proposal?.status === "pending") await db.proposals.update(id, { status: "cancelled" });
  });
}

export async function editPendingItem(
  proposalId: string,
  itemId: string,
  changes: Partial<ProposalItem>,
): Promise<void> {
  await db.transaction("rw", db.proposals, async () => {
    const proposal = await db.proposals.get(proposalId);
    if (proposal?.status !== "pending") return;
    const items = proposal.items.map((item) =>
      item.id === itemId
        ? applyFoodEdit(item, "grams" in changes ? { ...changes, portion: null } : changes)
        : item,
    );
    await db.proposals.update(proposalId, { items });
  });
}

export async function removePendingItem(proposalId: string, itemId: string): Promise<void> {
  await db.transaction("rw", db.proposals, async () => {
    const proposal = await db.proposals.get(proposalId);
    if (proposal?.status !== "pending") return;
    const items = proposal.items.filter((item) => item.id !== itemId);
    await db.proposals.update(proposalId, {
      items,
      status: items.length === 0 ? "cancelled" : "pending",
    });
  });
}

export async function editEntry(id: string, changes: Partial<Entry>): Promise<Entry | null> {
  return db.transaction("rw", db.entries, db.changes, async () => {
    const before = await db.entries.get(id);
    if (!before) return null;
    const after = applyFoodEdit(before, "grams" in changes ? { ...changes, portion: null } : changes);
    await db.entries.put(after);
    const gramsChange =
      before.grams !== after.grams ? `: ${before.grams ?? "?"} g → ${after.grams ?? "?"} g` : "";
    await recordChange({
      label: `Edited ${after.food}${gramsChange}`,
      table: "entries",
      key: id,
      before,
      after,
    });
    return after;
  });
}

export async function deleteEntry(id: string): Promise<Entry | null> {
  return db.transaction("rw", db.entries, db.changes, async () => {
    const before = await db.entries.get(id);
    if (!before) return null;
    await db.entries.delete(id);
    await recordChange({
      label: `Removed ${before.food}`,
      table: "entries",
      key: id,
      before,
      after: null,
    });
    return before;
  });
}

export async function logWeight(kg: number, date: string): Promise<void> {
  await db.transaction("rw", db.days, db.changes, async () => {
    const before = (await db.days.get(date)) ?? null;
    const after: Day = { date, weightKg: kg, incomplete: before?.incomplete ?? false };
    await db.days.put(after);
    await recordChange({
      label: `Logged weight: ${kg} kg`,
      table: "days",
      key: date,
      before,
      after,
    });
  });
}

export async function markDayIncomplete(date: string, incomplete: boolean): Promise<void> {
  await db.transaction("rw", db.days, db.changes, async () => {
    const before = (await db.days.get(date)) ?? null;
    const after: Day = { date, weightKg: before?.weightKg ?? null, incomplete };
    await db.days.put(after);
    await recordChange({
      label: `Marked ${date} as ${incomplete ? "incomplete" : "complete"}`,
      table: "days",
      key: date,
      before,
      after,
    });
  });
}

export async function setGoals(goals: Macros): Promise<void> {
  await db.transaction("rw", db.settings, db.changes, async () => {
    const before = (await db.settings.get(GOALS_KEY)) ?? null;
    const after = { key: GOALS_KEY, value: goals };
    await db.settings.put(after);
    await recordChange({ label: "Updated goals", table: "settings", key: GOALS_KEY, before, after });
  });
}

export async function saveCustomFood(
  name: string,
  per100g: Macros,
  servingG: number | null,
): Promise<CustomFood> {
  return db.transaction("rw", db.customFoods, db.changes, async () => {
    const before = (await db.customFoods.where("name").equalsIgnoreCase(name).first()) ?? null;
    const after: CustomFood = {
      id: before?.id ?? crypto.randomUUID(),
      name,
      per100g,
      servingG,
      createdAt: before?.createdAt ?? Date.now(),
    };
    await db.customFoods.put(after);
    await recordChange({
      label: `Saved food: ${name}`,
      table: "customFoods",
      key: after.id,
      before,
      after,
    });
    return after;
  });
}

// Puts things back as they were. Refused if the record has changed again since,
// so an older Undo can't wipe out a newer change.
export async function undoChange(id: string): Promise<boolean> {
  return db.transaction(
    "rw",
    [db.changes, db.entries, db.days, db.settings, db.customFoods],
    async () => {
      const change = await db.changes.get(id);
      if (!change || change.undone) return false;

      const table = db.table(change.table);
      const current = (await table.get(change.key)) ?? null;
      if (JSON.stringify(current) !== JSON.stringify(change.after)) return false;

      if (change.before === null) await table.delete(change.key);
      else await table.put(change.before);
      await db.changes.update(id, { undone: true });
      return true;
    },
  );
}
