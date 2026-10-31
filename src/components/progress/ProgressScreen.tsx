"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { dayKey } from "@/lib/dates";
import { db, type Macros } from "@/lib/db";
import { GOALS_KEY } from "@/lib/log";
import { fillDates, rangeStart, summarizeDays, summarizeWeeks, type RangeKey } from "@/lib/progress";
import { setSelectedDay } from "@/lib/selectedDay";
import CaloriesChart from "./CaloriesChart";
import DayHistory from "./DayHistory";
import WeeklyAverages from "./WeeklyAverages";
import WeightChart from "./WeightChart";

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "2w", label: "2 weeks" },
  { key: "1m", label: "1 month" },
  { key: "3m", label: "3 months" },
  { key: "all", label: "All" },
];

export default function ProgressScreen() {
  const router = useRouter();
  const [range, setRange] = useState<RangeKey>("1m");
  const [today] = useState(() => dayKey());

  const entries = useLiveQuery(() => db.entries.toArray(), []);
  const days = useLiveQuery(() => db.days.toArray(), []);
  const goals = useLiveQuery(async () => (await db.settings.get(GOALS_KEY))?.value as Macros | undefined, []);

  const summaries = useMemo(() => summarizeDays(entries ?? [], days ?? []), [entries, days]);
  const weeks = useMemo(() => summarizeWeeks(summaries, today), [summaries, today]);
  const chartDays = useMemo(() => fillDates(summaries, rangeStart(range, today), today), [summaries, range, today]);

  function openDay(date: string) {
    setSelectedDay(date === today ? null : date);
    router.push("/");
  }

  if (!entries || !days) return null;

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <h1 className="text-2xl font-semibold">Progress</h1>

      {summaries.length === 0 ? (
        <p className="text-sm text-muted">Nothing logged yet. Your charts will appear here.</p>
      ) : (
        <>
          <div role="group" aria-label="Chart range" className="grid grid-cols-4 gap-1 rounded-xl bg-surface p-1">
            {RANGES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={range === key}
                onClick={() => setRange(key)}
                className={`h-9 rounded-lg text-sm ${range === key ? "bg-accent font-semibold text-black" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <WeightChart days={chartDays} />
          <CaloriesChart days={chartDays} goal={goals?.kcal ?? null} />
          <WeeklyAverages weeks={weeks} />
          <DayHistory summaries={summaries} onOpen={openDay} />
        </>
      )}
    </div>
  );
}
