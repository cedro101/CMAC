"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import EditFoodSheet, { type FoodChanges } from "@/components/chat/EditFoodSheet";
import { db, type Entry, type Meal } from "@/lib/db";
import { deleteEntry, editEntry } from "@/lib/log";

const COLLAPSED_KEY = "cmac.foodListCollapsed";

const GROUPS: { meal: Meal | null; label: string }[] = [
  { meal: "breakfast", label: "Breakfast" },
  { meal: "lunch", label: "Lunch" },
  { meal: "dinner", label: "Dinner" },
  { meal: "snack", label: "Snack" },
  { meal: null, label: "Other" },
];

// Only a convenience, so it's fine if the browser won't store this.
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  } catch {}
}

function EntryRow({ entry, onSelect }: { entry: Entry; onSelect: () => void }) {
  const amount = [entry.grams === null ? null : `${entry.grams} g`, entry.rawOrCooked].filter(Boolean).join(" ");
  return (
    <button type="button" onClick={onSelect} className="flex w-full items-center justify-between gap-3 py-1.5 text-left">
      <span className="min-w-0">
        <span className="block truncate text-sm">
          {entry.food}
          {entry.estimate && (
            <span className="ml-1.5 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-300">Estimate</span>
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

export default function FoodList({ date }: { date: string }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [editing, setEditing] = useState<Entry | null>(null);
  const entries = useLiveQuery(() => db.entries.where("date").equals(date).sortBy("timestamp"), [date]);

  if (!entries) return null;

  function toggle() {
    setCollapsed(!collapsed);
    writeCollapsed(!collapsed);
  }

  async function handleSave(changes: FoodChanges) {
    if (editing) await editEntry(editing.id, changes);
    setEditing(null);
  }

  async function handleRemove() {
    if (editing) await deleteEntry(editing.id);
    setEditing(null);
  }

  return (
    <div className="border-t border-border px-4">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        className="flex h-9 w-full items-center justify-between text-sm font-medium"
      >
        <span>
          Food logged <span className="font-normal text-muted">({entries.length})</span>
        </span>
        <span aria-hidden="true" className="text-muted">
          {collapsed ? "▾" : "▴"}
        </span>
      </button>

      {!collapsed && (
        <div className="max-h-[28dvh] overflow-y-auto overscroll-contain pb-2">
          {entries.length === 0 && <p className="pb-1 text-sm text-muted">Nothing logged.</p>}
          {GROUPS.map(({ meal, label }) => {
            const group = entries.filter((entry) => entry.meal === meal);
            if (group.length === 0) return null;
            return (
              <div key={label}>
                <h3 className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted">{label}</h3>
                <div className="divide-y divide-border">
                  {group.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} onSelect={() => setEditing(entry)} />
                  ))}
                </div>
              </div>
            );
          })}
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
