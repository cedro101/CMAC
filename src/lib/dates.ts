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
  const month = String(shifted.getMonth() + 1).padStart(2, "0");
  const day = String(shifted.getDate()).padStart(2, "0");
  return `${shifted.getFullYear()}-${month}-${day}`;
}
