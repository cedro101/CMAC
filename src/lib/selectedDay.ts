// Which past day the Today tab is showing, or null for today. It's kept here so
// the Progress tab's day list can open a day on the Today tab.
let selectedDay: string | null = null;
const listeners = new Set<() => void>();

export function getSelectedDay(): string | null {
  return selectedDay;
}

export function setSelectedDay(day: string | null) {
  selectedDay = day;
  listeners.forEach((listener) => listener());
}

export function subscribeToSelectedDay(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
