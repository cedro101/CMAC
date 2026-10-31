import type { ReactNode } from "react";
import { formatShortDate } from "@/lib/dates";

export const AXIS_TICK = { fill: "var(--muted)", fontSize: 12 };

export function ChartCard({ title, value, legend, children }: { title: string; value?: string; legend?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        {value && <p className="text-sm tabular-nums text-muted">{value}</p>}
      </div>
      {legend && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">{legend}</div>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function TooltipBox({ date, lines }: { date: string; lines: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-lg shadow-black/40">
      <p className="font-semibold">{formatShortDate(date)}</p>
      {lines.map((line) => (
        <p key={line} className="mt-0.5 tabular-nums text-muted">
          {line}
        </p>
      ))}
    </div>
  );
}
