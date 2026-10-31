"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, type ProposalItem, type SavedMeal } from "@/lib/db";
import { findFrequentFoods, type FrequentFood } from "@/lib/food/frequent";
import { createProposal, undoProposal } from "@/lib/log";
import CopyMealSheet from "./CopyMealSheet";
import QuickAddSheet from "./QuickAddSheet";

const MAX_FOOD_CHIPS = 8;

const CHIP_CLASS =
  "h-8 max-w-48 shrink-0 truncate rounded-full border border-border bg-surface px-3 text-sm";

function mealToItems(meal: SavedMeal): ProposalItem[] {
  return meal.items.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
    portion: null,
    source: "saved",
    estimate: false,
  }));
}

export default function QuickActions({ today }: { today: string }) {
  const [adding, setAdding] = useState<FrequentFood | null>(null);
  const [copying, setCopying] = useState(false);

  const foods = useLiveQuery(() => findFrequentFoods(MAX_FOOD_CHIPS), []);
  const meals = useLiveQuery(() => db.meals.orderBy("name").toArray(), []);

  // The newest confirmed card today that still has something saved.
  const undoableCardId = useLiveQuery(async () => {
    const cards = await db.proposals.where("day").equals(today).toArray();
    const confirmed = cards.filter((card) => card.status === "confirmed").sort((a, b) => b.createdAt - a.createdAt);
    for (const card of confirmed) {
      const ids = card.items.flatMap((item) => (item.entryId ? [item.entryId] : []));
      const saved = await db.entries.bulkGet(ids);
      if (saved.some(Boolean)) return card.id;
    }
    return null;
  }, [today]);

  return (
    <>
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none]">
        {undoableCardId && (
          <button type="button" onClick={() => undoProposal(undoableCardId)} className={`${CHIP_CLASS} text-accent`}>
            Undo last log
          </button>
        )}
        <button type="button" onClick={() => setCopying(true)} className={CHIP_CLASS}>
          Copy yesterday&apos;s meal
        </button>
        {(meals ?? []).map((meal) => (
          <button
            key={meal.id}
            type="button"
            onClick={() => createProposal(today, null, mealToItems(meal))}
            className={CHIP_CLASS}
          >
            {meal.name}
          </button>
        ))}
        {(foods ?? []).map((food) => (
          <button key={food.ref} type="button" onClick={() => setAdding(food)} className={CHIP_CLASS}>
            {food.label}
          </button>
        ))}
      </div>

      {adding && <QuickAddSheet key={adding.ref} food={adding} today={today} onClose={() => setAdding(null)} />}
      {copying && <CopyMealSheet today={today} onClose={() => setCopying(false)} />}
    </>
  );
}
