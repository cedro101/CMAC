import Dexie, { type Table } from "dexie";

export type Meal = "breakfast" | "lunch" | "dinner" | "snack";
export type RawOrCooked = "raw" | "cooked";

// "user" is a number you gave directly, such as from a package.
export type FoodSource = "saved" | "history" | "usda" | "estimate" | "user" | "imported";

export type Macros = {
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

// Extra values such as micronutrients go here later without a migration.
export type Nutrients = Record<string, number | null>;

export type Entry = Macros & {
  id: string;
  date: string; // The logging day, from dayKey().
  food: string;
  grams: number | null;
  rawOrCooked: RawOrCooked | null;
  meal: Meal | null;
  estimate: boolean;
  source: FoodSource;
  timestamp: number; // When it was actually logged.
  nutrients?: Nutrients;
};

export type Day = {
  date: string;
  weightKg: number | null;
  incomplete: boolean;
};

export type CustomFood = {
  id: string;
  name: string;
  per100g: Macros;
  servingG: number | null;
  createdAt: number;
  nutrients?: Nutrients;
};

export type SavedMealItem = Macros & {
  food: string;
  grams: number | null;
  rawOrCooked: RawOrCooked | null;
};

export type SavedMeal = {
  id: string;
  name: string;
  items: SavedMealItem[];
};

export type Batch = {
  id: string;
  name: string;
  food: string;
  rawG: number;
  cookedG: number;
  perCookedGram: Macros;
  createdAt: number;
  expiresAt: number | null;
};

export type Setting = {
  key: string;
  value: unknown;
};

export type ChatMessage = {
  id: string;
  createdAt: number;
  role: "user" | "assistant";
  content: unknown;
};

class CmacDatabase extends Dexie {
  entries!: Table<Entry, string>;
  days!: Table<Day, string>;
  customFoods!: Table<CustomFood, string>;
  meals!: Table<SavedMeal, string>;
  batches!: Table<Batch, string>;
  settings!: Table<Setting, string>;
  chatMessages!: Table<ChatMessage, string>;

  constructor() {
    super("cmac");
    // Only indexed fields are listed here. Every other field is still stored.
    this.version(1).stores({
      entries: "id, date, timestamp, food",
      days: "date",
      customFoods: "id, name",
      meals: "id, name",
      batches: "id, name, expiresAt",
      settings: "key",
      chatMessages: "id, createdAt",
    });
  }
}

export const db = new CmacDatabase();
