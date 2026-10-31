import { formatShortDate } from "@/lib/dates";
import type { WeekSummary } from "@/lib/progress";

const MAX_WEEKS = 8;

function formatChange(change: number | null): string {
  if (change === null) return "–";
  return `${change > 0 ? "+" : ""}${change.toFixed(1)} kg`;
}

export default function WeeklyAverages({ weeks }: { weeks: WeekSummary[] }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Weekly averages</h2>
      <p className="mt-0.5 text-xs text-muted">Leaves out today, incomplete days and days missing calories.</p>
      <table className="mt-3 w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-xs text-muted">
            <th scope="col" className="pb-1 font-normal">
              Week of
            </th>
            <th scope="col" className="pb-1 text-right font-normal">
              Calories
            </th>
            <th scope="col" className="pb-1 text-right font-normal">
              Protein
            </th>
            <th scope="col" className="pb-1 text-right font-normal">
              Trend
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {weeks.slice(0, MAX_WEEKS).map((week) => (
            <tr key={week.weekStart}>
              <td className="py-1.5">{formatShortDate(week.weekStart)}</td>
              <td className="py-1.5 text-right">{week.avgKcal ?? "–"}</td>
              <td className="py-1.5 text-right">{week.avgProtein === null ? "–" : `${week.avgProtein} g`}</td>
              <td className="py-1.5 text-right">{formatChange(week.trendChangeKg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
