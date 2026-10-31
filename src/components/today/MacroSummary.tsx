"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Macros } from "@/lib/db";
import { GOALS_KEY } from "@/lib/log";
import { MACRO_KEYS, sumMacros, type MacroKey } from "@/lib/macros";

const LABELS: Record<MacroKey, string> = { kcal: "Calories", protein: "Protein", carbs: "Carbs", fat: "Fat" };

function MacroMeter({
  name,
  eaten,
  partial,
  goal,
  unit,
}: {
  name: string;
  eaten: number;
  partial: boolean;
  goal: number | null;
  unit: string;
}) {
  const fraction = goal ? Math.min(eaten / goal, 1) : 0;
  const difference = goal === null ? 0 : Math.round((goal - eaten) * 10) / 10;
  const over = goal !== null && difference < 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-1 text-xs">
        <span className="font-medium">{name}</span>
        <span className="tabular-nums text-muted">
          {eaten}
          {goal !== null ? ` / ${goal}` : ""}
          {unit}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={goal ?? eaten}
        aria-valuenow={eaten}
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-border"
      >
        <div
          className={`h-full rounded-full ${over ? "bg-warning" : "bg-accent"}`}
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <p className={`mt-0.5 text-xs tabular-nums ${over ? "text-warning" : "text-muted"}`}>
        {goal === null ? "No goal" : over ? `${-difference}${unit} over` : `${difference}${unit} left`}
        {partial && <span className="text-muted"> · partial</span>}
      </p>
    </div>
  );
}

export default function MacroSummary({ date }: { date: string }) {
  const entries = useLiveQuery(() => db.entries.where("date").equals(date).toArray(), [date]);
  const goals = useLiveQuery(async () => (await db.settings.get(GOALS_KEY))?.value as Macros | undefined, []);

  const totals = sumMacros(entries ?? []);

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-4 pb-2">
      {MACRO_KEYS.map((key) => (
        <MacroMeter
          key={key}
          name={LABELS[key]}
          eaten={totals[key].value}
          partial={totals[key].partial}
          goal={goals?.[key] ?? null}
          unit={key === "kcal" ? "" : "g"}
        />
      ))}
    </div>
  );
}
