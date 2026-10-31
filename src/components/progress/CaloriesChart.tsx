"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatShortDate } from "@/lib/dates";
import type { DaySummary } from "@/lib/progress";
import { AXIS_TICK, ChartCard, TooltipBox } from "./chartParts";

type ChartDay = Partial<DaySummary> & { date: string };

const HATCH_ID = "estimate-hatch";
const BAR_RADIUS: [number, number, number, number] = [4, 4, 0, 0];

function compactKcal(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);
}

function CaloriesTooltip({
  active,
  payload,
  goal,
}: {
  active?: boolean;
  payload?: { payload: ChartDay }[];
  goal: number | null;
}) {
  const day = payload?.[0]?.payload;
  if (!active || !day) return null;
  if (day.kcal == null) return <TooltipBox date={day.date} lines={["No calories logged"]} />;

  const lines = [`${day.kcal}${day.kcalPartial ? "+" : ""} kcal`];
  if (goal !== null) {
    const difference = day.kcal - goal;
    lines.push(difference > 0 ? `${difference} over goal` : `${-difference} under goal`);
  }
  if (day.estimateShare) lines.push(`${Math.round(day.estimateShare * 100)}% estimated`);
  if (day.incomplete) lines.push("Marked incomplete");
  return <TooltipBox date={day.date} lines={lines} />;
}

export default function CaloriesChart({ days, goal }: { days: ChartDay[]; goal: number | null }) {
  // Two series so that estimate-heavy days can have their own fill.
  const data = days.map((day) => ({
    ...day,
    measuredKcal: day.estimateHeavy ? null : (day.kcal ?? null),
    estimatedKcal: day.estimateHeavy ? (day.kcal ?? null) : null,
  }));

  return (
    <ChartCard
      title="Calories"
      value={goal !== null ? `Goal ${goal}` : "No goal set"}
      legend={
        <>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-accent" aria-hidden="true" />
            Logged
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden="true">
              <rect width="10" height="10" rx="2" fill="var(--accent)" opacity="0.3" />
              <path d="M-1 3 3 -1M-1 8 8 -1M3 11 11 3M8 11 11 8" stroke="var(--accent)" strokeWidth="1.5" />
            </svg>
            Mostly estimates
          </span>
          {goal !== null && (
            <span className="flex items-center gap-1.5">
              <span className="h-px w-4 bg-foreground" aria-hidden="true" />
              Goal
            </span>
          )}
        </>
      }
    >
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={1}>
          <defs>
            <pattern id={HATCH_ID} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--accent)" opacity="0.3" />
              <rect width="2" height="6" fill="var(--accent)" />
            </pattern>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={36}
          />
          <YAxis width={36} tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={compactKcal} />
          <Tooltip content={<CaloriesTooltip goal={goal} />} cursor={{ fill: "var(--border)", opacity: 0.5 }} />
          <Bar dataKey="measuredKcal" stackId="kcal" fill="var(--accent)" radius={BAR_RADIUS} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="estimatedKcal" stackId="kcal" fill={`url(#${HATCH_ID})`} radius={BAR_RADIUS} maxBarSize={24} isAnimationActive={false} />
          {goal !== null && <ReferenceLine y={goal} stroke="var(--foreground)" strokeWidth={1} ifOverflow="extendDomain" />}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
