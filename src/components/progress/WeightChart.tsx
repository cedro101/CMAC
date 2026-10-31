"use client";

import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatShortDate } from "@/lib/dates";
import type { DaySummary } from "@/lib/progress";
import { AXIS_TICK, ChartCard, TooltipBox } from "./chartParts";

type ChartDay = Partial<DaySummary> & { date: string };

const AXIS_PADDING_KG = 0.5;

function WeightTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartDay }[] }) {
  const day = payload?.[0]?.payload;
  if (!active || !day) return null;
  const lines = [
    day.weightKg != null ? `Weight ${day.weightKg} kg` : "No weigh-in",
    ...(day.trendKg != null ? [`Trend ${day.trendKg.toFixed(1)} kg`] : []),
  ];
  return <TooltipBox date={day.date} lines={lines} />;
}

export default function WeightChart({ days }: { days: ChartDay[] }) {
  const weights = days.flatMap((day) => (day.weightKg != null ? [day.weightKg] : []));
  const latestTrend = days.findLast((day) => day.trendKg != null)?.trendKg;

  if (weights.length === 0) {
    return (
      <ChartCard title="Weight">
        <p className="text-sm text-muted">No weigh-ins in this range.</p>
      </ChartCard>
    );
  }

  const domain = [
    Math.floor(Math.min(...weights) - AXIS_PADDING_KG),
    Math.ceil(Math.max(...weights) + AXIS_PADDING_KG),
  ];

  return (
    <ChartCard
      title="Weight"
      value={latestTrend != null ? `Trend ${latestTrend.toFixed(1)} kg` : undefined}
      legend={
        <>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-accent" aria-hidden="true" />7 day trend
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-muted" aria-hidden="true" />
            Daily weight
          </span>
        </>
      }
    >
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            minTickGap={36}
          />
          <YAxis domain={domain} width={32} tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<WeightTooltip />} cursor={{ stroke: "var(--muted)" }} />
          <Line
            dataKey="weightKg"
            stroke="none"
            isAnimationActive={false}
            dot={{ r: 3, fill: "var(--muted)", stroke: "var(--surface)", strokeWidth: 1 }}
            activeDot={{ r: 5, fill: "var(--foreground)", stroke: "var(--surface)", strokeWidth: 2 }}
          />
          <Line
            dataKey="trendKg"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinecap="round"
            dot={false}
            activeDot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
