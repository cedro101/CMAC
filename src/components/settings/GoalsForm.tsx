"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { type FormEvent, useState } from "react";
import { db, type Macros } from "@/lib/db";
import { GOALS_KEY, setGoals } from "@/lib/log";
import { MACRO_KEYS, type MacroKey } from "@/lib/macros";

const LABELS: Record<MacroKey, string> = { kcal: "Calories", protein: "Protein (g)", carbs: "Carbs (g)", fat: "Fat (g)" };

function Form({ initial }: { initial: Macros | null }) {
  const [fields, setFields] = useState<Record<MacroKey, string>>({
    kcal: initial?.kcal?.toString() ?? "",
    protein: initial?.protein?.toString() ?? "",
    carbs: initial?.carbs?.toString() ?? "",
    fat: initial?.fat?.toString() ?? "",
  });
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const goals = {} as Macros;
    for (const key of MACRO_KEYS) {
      const text = fields[key].trim().replace(",", ".");
      const value = text === "" ? null : Number(text);
      if (value !== null && (!Number.isFinite(value) || value <= 0)) {
        setMessage({ text: `Enter ${LABELS[key]} as a number above 0, or leave it blank.`, error: true });
        return;
      }
      goals[key] = value;
    }
    await setGoals(goals);
    setMessage({ text: "Goals saved.", error: false });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Daily goals</h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {MACRO_KEYS.map((key) => (
          <label key={key} className="flex flex-col gap-1 text-sm text-muted">
            {LABELS[key]}
            <input
              inputMode="decimal"
              value={fields[key]}
              onChange={(event) => {
                setFields((current) => ({ ...current, [key]: event.target.value }));
                setMessage(null);
              }}
              className="h-11 w-full rounded-xl border border-border bg-background px-3 text-foreground outline-none focus:border-accent"
            />
          </label>
        ))}
      </div>
      <button type="submit" className="mt-3 h-11 w-full rounded-xl bg-accent font-semibold text-black">
        Save goals
      </button>
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mt-2 text-sm ${message.error ? "text-danger" : "text-muted"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}

export default function GoalsForm() {
  // Null once loaded with no goals saved, and undefined while still loading.
  const goals = useLiveQuery(async () => ((await db.settings.get(GOALS_KEY))?.value as Macros | undefined) ?? null, []);
  if (goals === undefined) return null;
  // Remounts when the chat sets new goals, so these fields show them.
  return <Form key={JSON.stringify(goals)} initial={goals} />;
}
