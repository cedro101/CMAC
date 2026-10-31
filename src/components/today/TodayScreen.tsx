"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { dayKey, formatDayLabel, shiftDate } from "@/lib/dates";
import { db } from "@/lib/db";
import ChatPopup from "./ChatPopup";
import FoodList from "./FoodList";
import MacroSummary from "./MacroSummary";
import QuickActions from "./QuickActions";

export default function TodayScreen() {
  const [today, setToday] = useState(() => dayKey());
  const [selected, setSelected] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const shown = selected ?? today;
  const isToday = selected === null;

  const dayRecord = useLiveQuery(() => db.days.get(shown), [shown]);

  // Reopening after 4 am moves on to the new day.
  useEffect(() => {
    const refreshDay = () => {
      if (document.visibilityState === "visible") setToday(dayKey());
    };
    document.addEventListener("visibilitychange", refreshDay);
    return () => document.removeEventListener("visibilitychange", refreshDay);
  }, []);

  function goToNextDay() {
    const next = shiftDate(shown, 1);
    setSelected(next >= today ? null : next);
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <button
          type="button"
          onClick={() => setSelected(shiftDate(shown, -1))}
          aria-label="Previous day"
          className="size-10 text-xl text-muted"
        >
          ‹
        </button>
        <div className="min-w-0 text-center">
          <p className="truncate text-sm font-semibold">
            {isToday ? "Today · " : ""}
            {formatDayLabel(shown)}
          </p>
          {(dayRecord?.weightKg != null || dayRecord?.incomplete) && (
            <p className="truncate text-xs text-muted">
              {[dayRecord.weightKg != null ? `${dayRecord.weightKg} kg` : null, dayRecord.incomplete ? "Incomplete" : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={goToNextDay}
          disabled={isToday}
          aria-label="Next day"
          className="size-10 text-xl text-muted disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <MacroSummary date={shown} />
      {isToday && <QuickActions today={today} onCardCreated={() => setChatOpen(true)} />}
      <FoodList date={shown} />

      <ChatPopup
        day={shown}
        readOnly={!isToday}
        open={chatOpen}
        onOpen={() => setChatOpen(true)}
        onClose={() => setChatOpen(false)}
        onBeforeSend={() => setToday(dayKey())}
      />
    </div>
  );
}
