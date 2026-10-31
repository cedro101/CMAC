import { formatDayLabel } from "@/lib/dates";
import type { DaySummary } from "@/lib/progress";

export default function DayHistory({
  summaries,
  onOpen,
}: {
  summaries: DaySummary[];
  onOpen: (date: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface px-4 pb-2 pt-4">
      <h2 className="font-semibold">Day by day</h2>
      <div className="mt-1 divide-y divide-border">
        {[...summaries].reverse().map((day) => (
          <button
            key={day.date}
            type="button"
            onClick={() => onOpen(day.date)}
            className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">{formatDayLabel(day.date)}</span>
              <span className="block text-xs text-muted">
                {[
                  day.weightKg !== null ? `${day.weightKg} kg` : null,
                  day.estimateHeavy ? "Mostly estimates" : null,
                  day.incomplete ? "Incomplete" : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || " "}
              </span>
            </span>
            <span className="shrink-0 text-right text-xs tabular-nums">
              <span className="block font-medium">
                {day.kcal === null ? "–" : `${day.kcal}${day.kcalPartial ? "+" : ""} kcal`}
              </span>
              <span className="block text-muted">
                P {day.protein === null ? "–" : `${day.protein}${day.proteinPartial ? "+" : ""} g`}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
