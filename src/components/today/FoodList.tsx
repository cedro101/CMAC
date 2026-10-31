"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import ChangeNotice from "@/components/chat/ChangeNotice";
import EditFoodSheet, { type FoodChanges } from "@/components/chat/EditFoodSheet";
import { db, type ChangeRecord, type Entry, type Meal } from "@/lib/db";
import { deleteEntry, editEntry } from "@/lib/log";
import { sumMacros } from "@/lib/macros";

const MEALS: { meal: Meal; label: string }[] = [
  { meal: "breakfast", label: "Breakfast" },
  { meal: "snack", label: "Snack" },
  { meal: "lunch", label: "Lunch" },
  { meal: "dinner", label: "Dinner" },
];

const UNDO_VISIBLE_MS = 8000;

function EntryRow({ entry, onSelect }: { entry: Entry; onSelect: () => void }) {
  const amount = [entry.grams === null ? null : `${entry.grams} g`, entry.rawOrCooked].filter(Boolean).join(" ");
  return (
    <button type="button" onClick={onSelect} className="flex w-full items-center justify-between gap-3 py-2 text-left">
      <span className="min-w-0">
        <span className="block text-sm">
          {entry.food}
          {entry.estimate && (
            <span className="ml-1.5 whitespace-nowrap rounded-md bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300">
              Estimate
            </span>
          )}
        </span>
        {amount && <span className="block text-xs text-muted">{amount}</span>}
      </span>
      <span className="shrink-0 text-right text-xs tabular-nums">
        <span className="block font-medium">{entry.kcal === null ? "–" : `${entry.kcal} kcal`}</span>
        <span className="block text-muted">P {entry.protein === null ? "–" : `${entry.protein}g`}</span>
      </span>
    </button>
  );
}

function MealSection({
  label,
  entries,
  onSelect,
}: {
  label: string;
  entries: Entry[];
  onSelect: (entry: Entry) => void;
}) {
  const total = sumMacros(entries).kcal;
  return (
    <section className="mt-4">
      <div className="flex items-baseline justify-between border-b border-border pb-1">
        <h2 className="font-semibold">{label}</h2>
        {entries.length > 0 && (
          <span className="text-sm tabular-nums text-muted">
            {total.value}
            {total.partial ? "+" : ""} kcal
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="py-2 text-sm text-muted">Nothing yet</p>
      ) : (
        <div className="divide-y divide-border">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onSelect={() => onSelect(entry)} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function FoodList({ date }: { date: string }) {
  const [editing, setEditing] = useState<Entry | null>(null);
  const [lastChangeId, setLastChangeId] = useState<string | null>(null);
  const entries = useLiveQuery(() => db.entries.where("date").equals(date).sortBy("timestamp"), [date]);
  const lastChange: ChangeRecord | undefined = useLiveQuery(
    async () => (lastChangeId ? db.changes.get(lastChangeId) : undefined),
    [lastChangeId],
  );

  // A change's Undo is also in the chat, so this one only shows briefly.
  useEffect(() => {
    if (!lastChangeId) return;
    const timer = setTimeout(() => setLastChangeId(null), UNDO_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [lastChangeId]);

  if (!entries) return null;

  async function showUndo() {
    const change = await db.changes.orderBy("createdAt").last();
    setLastChangeId(change?.id ?? null);
  }

  async function handleSave(changes: FoodChanges) {
    if (editing && Object.keys(changes).length > 0) {
      await editEntry(editing.id, changes);
      await showUndo();
    }
    setEditing(null);
  }

  async function handleRemove() {
    if (editing) {
      await deleteEntry(editing.id);
      await showUndo();
    }
    setEditing(null);
  }

  const noMeal = entries.filter((entry) => entry.meal === null);

  return (
    <div className="px-4">
      {MEALS.map(({ meal, label }) => (
        <MealSection
          key={meal}
          label={label}
          entries={entries.filter((entry) => entry.meal === meal)}
          onSelect={setEditing}
        />
      ))}
      {noMeal.length > 0 && <MealSection label="Other" entries={noMeal} onSelect={setEditing} />}

      {lastChange && (
        <div
          className="fixed inset-x-4 z-[6] bg-background"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 8rem)" }}
        >
          <ChangeNotice change={lastChange} />
        </div>
      )}

      {editing && (
        <EditFoodSheet
          key={editing.id}
          food={editing}
          showMeal
          onSave={handleSave}
          onRemove={handleRemove}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
