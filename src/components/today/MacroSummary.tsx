"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useId } from "react";
import { db, type Macros } from "@/lib/db";
import { GOALS_KEY } from "@/lib/log";
import { sumMacros } from "@/lib/macros";

const RING_SIZE = 176;
const RING_STROKE = 14;

// Checked for colour-blind separation and contrast on the dark background.
const MACRO_ROWS = [
  { key: "protein", label: "Protein", color: "#0c93d6" },
  { key: "carbs", label: "Carbs", color: "#bf8306" },
  { key: "fat", label: "Fat", color: "#ec4899" },
] as const;

function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

function CalorieRing({ eaten, goal, partial }: { eaten: number; goal: number | null; partial: boolean }) {
  const gradientId = useId();
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const fraction = goal ? Math.min(eaten / goal, 1) : 0;
  const over = goal !== null && eaten > goal;

  return (
    <div
      role="progressbar"
      aria-label="Calories"
      aria-valuemin={0}
      aria-valuemax={goal ?? undefined}
      aria-valuenow={eaten}
      className="relative mx-auto"
      style={{ width: RING_SIZE, height: RING_SIZE }}
    >
      <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#0c93d6" />
          </linearGradient>
        </defs>
        <circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={RING_STROKE}
        />
        {fraction > 0 && (
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={radius}
            fill="none"
            stroke={over ? "var(--warning)" : `url(#${gradientId})`}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${fraction * 100} 100`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-4xl font-semibold tabular-nums">{eaten}</p>
        <p className="text-sm text-muted">{goal === null ? "calories" : `of ${goal} kcal`}</p>
        <p className={`mt-0.5 text-sm font-medium tabular-nums ${over ? "text-warning" : ""}`}>
          {goal === null ? "No goal set" : over ? `${eaten - goal} over` : `${goal - eaten} left`}
        </p>
        {partial && <p className="text-xs text-muted">partial</p>}
      </div>
    </div>
  );
}

function MacroRow({
  label,
  color,
  eaten,
  goal,
  partial,
}: {
  label: string;
  color: string;
  eaten: number;
  goal: number | null;
  partial: boolean;
}) {
  const fraction = goal ? Math.min(eaten / goal, 1) : 0;
  const difference = goal === null ? 0 : roundOne(goal - eaten);
  const over = goal !== null && difference < 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted">
          {eaten}
          {goal !== null ? ` / ${goal}` : ""} g
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={goal ?? undefined}
        aria-valuenow={eaten}
        className="mt-1 h-2 overflow-hidden rounded-full bg-border"
      >
        <div className="h-full rounded-full" style={{ width: `${fraction * 100}%`, backgroundColor: color }} />
      </div>
      <p className={`mt-0.5 text-xs tabular-nums ${over ? "text-warning" : "text-muted"}`}>
        {goal === null ? "No goal" : over ? `${-difference} g over` : `${difference} g left`}
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
    <div className="px-4 pb-3">
      <CalorieRing eaten={totals.kcal.value} goal={goals?.kcal ?? null} partial={totals.kcal.partial} />
      <div className="mt-4 flex flex-col gap-2.5">
        {MACRO_ROWS.map(({ key, label, color }) => (
          <MacroRow
            key={key}
            label={label}
            color={color}
            eaten={totals[key].value}
            goal={goals?.[key] ?? null}
            partial={totals[key].partial}
          />
        ))}
      </div>
    </div>
  );
}
