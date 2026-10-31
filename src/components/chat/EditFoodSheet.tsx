"use client";

import { type FormEvent, useState } from "react";
import type { Macros, Meal, RawOrCooked } from "@/lib/db";
import { applyFoodEdit } from "@/lib/macros";
import Sheet from "../Sheet";

// Step 3's food list will open this same sheet.
export type EditableFood = Macros & {
  food: string;
  grams: number | null;
  rawOrCooked: RawOrCooked | null;
  source: string;
  meal?: Meal | null;
};

export type FoodChanges = {
  food?: string;
  grams?: number | null;
  rawOrCooked?: RawOrCooked | null;
  meal?: Meal | null;
};

const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

// Returns undefined for text that isn't a usable number. Blank means unknown.
function parseGrams(text: string): number | null | undefined {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function formatMacro(value: number | null, unit = "g"): string {
  return value === null ? "–" : `${value}${unit}`;
}

export default function EditFoodSheet({
  food,
  showMeal = false,
  onSave,
  onRemove,
  onClose,
}: {
  food: EditableFood;
  showMeal?: boolean;
  onSave: (changes: FoodChanges) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(food.food);
  const [grams, setGrams] = useState(food.grams === null ? "" : String(food.grams));
  const [rawOrCooked, setRawOrCooked] = useState(food.rawOrCooked);
  const [meal, setMeal] = useState(food.meal ?? null);
  const [error, setError] = useState<string | null>(null);

  const parsedGrams = parseGrams(grams);
  // Macros can't be typed here. They always come from the food's data, scaled by the grams.
  const preview = parsedGrams ? applyFoodEdit(food, { grams: parsedGrams }) : food;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const changes: FoodChanges = {};

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Give the food a name.");
      return;
    }
    if (trimmedName !== food.food) changes.food = trimmedName;

    if (parsedGrams === undefined) {
      setError("Enter the grams as a number above 0, or leave it blank.");
      return;
    }
    if (parsedGrams !== food.grams) changes.grams = parsedGrams;

    if (rawOrCooked !== food.rawOrCooked) changes.rawOrCooked = rawOrCooked;
    if (showMeal && meal !== (food.meal ?? null)) changes.meal = meal;

    onSave(changes);
  }

  const fieldClass =
    "h-11 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-accent";

  return (
    <Sheet onClose={onClose}>
      <form role="dialog" aria-label={`Edit ${food.food}`} onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3 p-4">
          <label className="flex flex-col gap-1 text-sm text-muted">
            Food
            <input value={name} onChange={(event) => setName(event.target.value)} className={`${fieldClass} text-foreground`} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm text-muted">
              Grams
              <input
                inputMode="decimal"
                value={grams}
                onChange={(event) => setGrams(event.target.value)}
                className={`${fieldClass} text-foreground`}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              Weighed
              <select
                value={rawOrCooked ?? ""}
                onChange={(event) => setRawOrCooked((event.target.value || null) as RawOrCooked | null)}
                className={`${fieldClass} text-foreground`}
              >
                <option value="">Not specified</option>
                <option value="raw">Raw</option>
                <option value="cooked">Cooked</option>
              </select>
            </label>
          </div>

          <p className="text-sm tabular-nums" data-testid="macro-preview">
            <span className="font-semibold">{formatMacro(preview.kcal, " kcal")}</span>
            <span className="text-muted">
              {" "}
              · P {formatMacro(preview.protein)} · C {formatMacro(preview.carbs)} · F {formatMacro(preview.fat)}
            </span>
          </p>

          {showMeal && (
            <label className="flex flex-col gap-1 text-sm text-muted">
              Meal
              <select
                value={meal ?? ""}
                onChange={(event) => setMeal((event.target.value || null) as Meal | null)}
                className={`${fieldClass} capitalize text-foreground`}
              >
                <option value="">None</option>
                {MEALS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button type="submit" className="h-11 flex-1 rounded-xl bg-accent font-semibold text-black">
              Save
            </button>
            <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-border font-semibold">
              Cancel
            </button>
          </div>
          <button type="button" onClick={onRemove} className="h-11 rounded-xl font-semibold text-danger">
            Remove
          </button>
        </div>
      </form>
    </Sheet>
  );
}
