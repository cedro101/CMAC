"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Sheet from "@/components/Sheet";
import { shiftDate } from "@/lib/dates";
import { db, type Entry, type Meal } from "@/lib/db";
import { entriesToCardItems } from "@/lib/food/frequent";
import { createProposal } from "@/lib/log";
import { sumMacros } from "@/lib/macros";

const GROUPS: { meal: Meal | null; label: string }[] = [
  { meal: "breakfast", label: "Breakfast" },
  { meal: "lunch", label: "Lunch" },
  { meal: "dinner", label: "Dinner" },
  { meal: "snack", label: "Snack" },
  { meal: null, label: "Other" },
];

// Puts one of yesterday's meals on a confirm card in the chat.
export default function CopyMealSheet({ today, onClose }: { today: string; onClose: () => void }) {
  const yesterday = shiftDate(today, -1);
  const entries = useLiveQuery(() => db.entries.where("date").equals(yesterday).sortBy("timestamp"), [yesterday]);

  async function handleCopy(meal: Meal | null, group: Entry[]) {
    await createProposal(today, meal, entriesToCardItems(group));
    onClose();
  }

  return (
    <Sheet onClose={onClose}>
      <div role="dialog" aria-label="Copy yesterday's meal" className="flex flex-col gap-2 p-4">
        <h2 className="font-semibold">Copy yesterday&apos;s meal</h2>
        {entries?.length === 0 && <p className="text-sm text-muted">Nothing was logged yesterday.</p>}
        {GROUPS.map(({ meal, label }) => {
          const group = (entries ?? []).filter((entry) => entry.meal === meal);
          if (group.length === 0) return null;
          const totals = sumMacros(group);
          return (
            <button
              key={label}
              type="button"
              onClick={() => handleCopy(meal, group)}
              className="rounded-xl border border-border p-3 text-left"
            >
              <span className="flex justify-between gap-3 text-sm font-medium">
                {label}
                <span className="shrink-0 tabular-nums text-muted">
                  {totals.kcal.value}
                  {totals.kcal.partial ? "+" : ""} kcal
                </span>
              </span>
              <span className="mt-0.5 block text-sm text-muted">{group.map((entry) => entry.food).join(", ")}</span>
            </button>
          );
        })}
        <button type="button" onClick={onClose} className="mt-1 h-11 rounded-xl border border-border font-semibold">
          Cancel
        </button>
      </div>
    </Sheet>
  );
}
