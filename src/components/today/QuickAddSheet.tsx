"use client";

import { type FormEvent, useState } from "react";
import Sheet from "@/components/Sheet";
import { resolveItem } from "@/lib/chat/proposal";
import type { Meal, RawOrCooked } from "@/lib/db";
import type { FrequentFood } from "@/lib/food/frequent";
import { needsRawOrCooked } from "@/lib/food/rawCooked";
import { confirmProposal, createProposal } from "@/lib/log";

const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

function formatMacro(value: number | null, unit = "g"): string {
  return value === null ? "–" : `${value}${unit}`;
}

// A one-tap confirm card for a frequent food. It uses the same calculation as
// the chatbot's cards but never calls Claude, so it costs nothing.
export default function QuickAddSheet({
  food,
  today,
  onClose,
}: {
  food: FrequentFood;
  today: string;
  onClose: () => void;
}) {
  // Restaurant meals are repeated whole, so they're counted in portions instead.
  const weighed = food.lookup.perPortion === null;
  const [amount, setAmount] = useState(weighed ? String(food.lastGrams ?? "") : "1");
  const [rawOrCooked, setRawOrCooked] = useState<RawOrCooked | null>(food.lookup.rawOrCooked);
  const [meal, setMeal] = useState<Meal | null>(food.lastMeal);

  const parsed = Number(amount.trim().replace(",", "."));
  const validAmount = Number.isFinite(parsed) && parsed > 0;
  const missingState = weighed && rawOrCooked === null && needsRawOrCooked(food.label);

  const result =
    validAmount && !missingState
      ? resolveItem(
          {
            food: food.label,
            kind: "lookup",
            ref: food.ref,
            raw_or_cooked: rawOrCooked,
            ...(weighed ? { grams: parsed } : { count: parsed }),
          },
          food.lookup,
        )
      : null;
  const item = result?.ok ? result.item : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    await confirmProposal(await createProposal(today, meal, [item]));
    onClose();
  }

  const fieldClass =
    "h-11 w-full rounded-xl border border-border bg-background px-3 text-foreground outline-none focus:border-accent";

  return (
    <Sheet onClose={onClose}>
      <form role="dialog" aria-label={`Add ${food.label}`} onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">{food.label}</h2>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm text-muted">
            {weighed ? "Grams" : "Portions"}
            <input
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-muted">
            Meal
            <select
              value={meal ?? ""}
              onChange={(event) => setMeal((event.target.value || null) as Meal | null)}
              className={`${fieldClass} capitalize`}
            >
              <option value="">None</option>
              {MEALS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        {weighed && food.lookup.rawOrCooked === null && needsRawOrCooked(food.label) && (
          <label className="flex flex-col gap-1 text-sm text-muted">
            Weighed
            <select
              value={rawOrCooked ?? ""}
              onChange={(event) => setRawOrCooked((event.target.value || null) as RawOrCooked | null)}
              className={fieldClass}
            >
              <option value="">Choose raw or cooked</option>
              <option value="raw">Raw</option>
              <option value="cooked">Cooked</option>
            </select>
          </label>
        )}

        <p className="text-sm tabular-nums">
          {item ? (
            <>
              <span className="font-semibold">{formatMacro(item.kcal, " kcal")}</span>
              <span className="text-muted">
                {" "}
                · P {formatMacro(item.protein)} · C {formatMacro(item.carbs)} · F {formatMacro(item.fat)}
              </span>
            </>
          ) : (
            <span className="text-muted">
              {missingState ? "Choose raw or cooked to see the macros." : `Enter ${weighed ? "the grams" : "the portions"} to see the macros.`}
            </span>
          )}
        </p>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!item}
            className="h-11 flex-1 rounded-xl bg-accent font-semibold text-black disabled:opacity-50"
          >
            Confirm
          </button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-border font-semibold">
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}
