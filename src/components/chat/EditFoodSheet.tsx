"use client";

import { type FormEvent, useState } from "react";
import type { Macros, Meal, RawOrCooked } from "@/lib/db";
import { applyFoodEdit, MACRO_KEYS, type MacroKey } from "@/lib/macros";

// Step 3's food list will open this same sheet.
export type EditableFood = Macros & {
  food: string;
  grams: number | null;
  rawOrCooked: RawOrCooked | null;
  estimate: boolean;
  source: string;
  meal?: Meal | null;
};

export type FoodChanges = Partial<Macros> & {
  food?: string;
  grams?: number | null;
  rawOrCooked?: RawOrCooked | null;
  estimate?: boolean;
  meal?: Meal | null;
};

const MACRO_LABELS: Record<MacroKey, string> = { kcal: "kcal", protein: "Protein", carbs: "Carbs", fat: "Fat" };
const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

function toField(value: number | null): string {
  return value === null ? "" : String(value);
}

// Returns undefined for text that isn't a usable number. Blank means unknown.
function parseNumber(text: string): number | null | undefined {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
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
  const [grams, setGrams] = useState(toField(food.grams));
  const [rawOrCooked, setRawOrCooked] = useState(food.rawOrCooked);
  const [estimate, setEstimate] = useState(food.estimate);
  const [meal, setMeal] = useState(food.meal ?? null);
  const [macros, setMacros] = useState<Record<MacroKey, string>>({
    kcal: toField(food.kcal),
    protein: toField(food.protein),
    carbs: toField(food.carbs),
    fat: toField(food.fat),
  });
  const [typedMacros, setTypedMacros] = useState<MacroKey[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Shows the rescaled macros as the grams change, except any typed by hand.
  function handleGramsChange(text: string) {
    setGrams(text);
    const parsed = parseNumber(text);
    if (!parsed) return;
    const rescaled = applyFoodEdit(food, { grams: parsed });
    setMacros((current) => {
      const next = { ...current };
      for (const key of MACRO_KEYS) {
        if (!typedMacros.includes(key)) next[key] = toField(rescaled[key]);
      }
      return next;
    });
  }

  function handleMacroChange(key: MacroKey, text: string) {
    setMacros((current) => ({ ...current, [key]: text }));
    setTypedMacros((current) => (current.includes(key) ? current : [...current, key]));
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const changes: FoodChanges = {};

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Give the food a name.");
      return;
    }
    if (trimmedName !== food.food) changes.food = trimmedName;

    const parsedGrams = parseNumber(grams);
    if (parsedGrams === undefined || parsedGrams === 0) {
      setError("Enter the grams as a number above 0, or leave it blank.");
      return;
    }
    if (parsedGrams !== food.grams) changes.grams = parsedGrams;

    for (const key of typedMacros) {
      const parsed = parseNumber(macros[key]);
      if (parsed === undefined) {
        setError(`Enter ${MACRO_LABELS[key]} as a number, or leave it blank if unknown.`);
        return;
      }
      if (parsed !== food[key]) changes[key] = parsed;
    }

    if (rawOrCooked !== food.rawOrCooked) changes.rawOrCooked = rawOrCooked;
    if (estimate !== food.estimate) changes.estimate = estimate;
    if (showMeal && meal !== (food.meal ?? null)) changes.meal = meal;

    onSave(changes);
  }

  const fieldClass =
    "h-11 w-full rounded-xl border border-border bg-background px-3 outline-none focus:border-accent";

  return (
    <div className="fixed inset-0 z-10 flex items-end bg-black/60" onClick={onClose}>
      <form
        role="dialog"
        aria-label={`Edit ${food.food}`}
        onSubmit={handleSubmit}
        onClick={(event) => event.stopPropagation()}
        className="pb-safe max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl border-t border-border bg-surface"
      >
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
                onChange={(event) => handleGramsChange(event.target.value)}
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

          <div className="grid grid-cols-2 gap-3">
            {MACRO_KEYS.map((key) => (
              <label key={key} className="flex flex-col gap-1 text-sm text-muted">
                {MACRO_LABELS[key]}
                <input
                  inputMode="decimal"
                  value={macros[key]}
                  placeholder="Unknown"
                  onChange={(event) => handleMacroChange(key, event.target.value)}
                  className={`${fieldClass} text-foreground`}
                />
              </label>
            ))}
          </div>

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

          <label className="flex h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={estimate}
              onChange={(event) => setEstimate(event.target.checked)}
              className="size-5 accent-[var(--accent)]"
            />
            These numbers are an estimate
          </label>

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
    </div>
  );
}
