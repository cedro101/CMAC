"use client";

import { dayKey } from "@/lib/dates";

export default function TodayPage() {
  return (
    <div className="flex flex-col gap-2 p-4">
      <h1 className="text-2xl font-semibold">Today</h1>
      <p className="text-sm text-muted">Logging day: {dayKey()}</p>
      <p className="text-sm text-muted">The chat and your food list arrive in the next steps.</p>
    </div>
  );
}
