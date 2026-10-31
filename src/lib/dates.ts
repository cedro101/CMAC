import { DAY_ROLLOVER_HOUR } from "./config";

// The logging day (YYYY-MM-DD) a moment belongs to. Everything that needs
// "today" goes through here so the 4 am rule lives in one place.
export function dayKey(moment: Date = new Date()): string {
  const shifted = new Date(
    moment.getFullYear(),
    moment.getMonth(),
    moment.getDate(),
    moment.getHours() - DAY_ROLLOVER_HOUR,
    moment.getMinutes(),
  );
  return formatDate(shifted);
}

function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseDate(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Moves a YYYY-MM-DD key by a number of days.
export function shiftDate(key: string, days: number): string {
  const date = parseDate(key);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

// True only for a real calendar date, so "2026-02-31" is rejected.
export function isValidDateKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && formatDate(parseDate(key)) === key;
}

// The Monday that starts the week a date falls in.
export function weekStart(key: string): string {
  const daysSinceMonday = (parseDate(key).getDay() + 6) % 7;
  return shiftDate(key, -daysSinceMonday);
}

export function formatShortDate(key: string): string {
  return parseDate(key).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

export function formatDayLabel(key: string): string {
  return parseDate(key).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
}
