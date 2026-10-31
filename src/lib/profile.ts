import { db } from "./db";

export const PROFILE_KEY = "profile";

export type ActivityLevel = "light" | "moderate" | "very" | "extra";

// What the user tells the app about themselves. It's stored only on their phone.
export type Profile = {
  age: number;
  sex: "male" | "female";
  heightCm: number;
  activity: ActivityLevel;
  about: string;
};

export const ACTIVITY_LEVELS: Record<ActivityLevel, { label: string; low: number; high: number }> = {
  light: { label: "Light: some walking, 1 to 2 workouts a week", low: 1.3, high: 1.45 },
  moderate: { label: "Moderate: 3 to 4 workouts a week", low: 1.45, high: 1.6 },
  very: { label: "Very active: 5 or more workouts, plus lots of steps", low: 1.55, high: 1.75 },
  extra: { label: "Extra: hard training most days, or a physical job", low: 1.75, high: 1.95 },
};

export async function getProfile(): Promise<Profile | null> {
  return ((await db.settings.get(PROFILE_KEY))?.value as Profile | undefined) ?? null;
}

export async function saveProfile(profile: Profile): Promise<void> {
  await db.settings.put({ key: PROFILE_KEY, value: profile });
}
