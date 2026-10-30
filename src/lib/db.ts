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
  portion?: string | null; // For counted food, such as "1 × medium".
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
  day: string; // Each logging day is its own conversation with Claude.
  createdAt: number;
  role: "user" | "assistant";
  content: unknown; // Exactly what the Claude API sent or received. Never rewritten.
  backgroundText?: string; // The background block this message carried, if any.
  usage?: unknown;
};

export type ProposalItem = Macros & {
  id: string;
  food: string;
  grams: number | null;
  rawOrCooked: RawOrCooked | null;
  portion: string | null;
  source: FoodSource;
  estimate: boolean;
  entryId?: string; // Set once the item has been saved as an entry.
};

export type ProposalStatus = "pending" | "confirmed" | "cancelled" | "replaced";

export type Proposal = {
  id: string;
  day: string;
  createdAt: number;
  status: ProposalStatus;
  date: string; // The logging day the food will count toward.
  meal: Meal | null;
  items: ProposalItem[];
};

export type FoodPortion = {
  label: string;
  grams: number;
};

// The numbers behind a reference from search_food, so that confirm cards use
// these values and not numbers the model typed.
export type FoodLookup = {
  ref: string;
  name: string;
  source: "saved" | "history" | "usda";
  per100g: Macros | null;
  perPortion: Macros | null;
  rawOrCooked: RawOrCooked | null;
  estimate: boolean;
  portions: FoodPortion[];
  defaultGrams?: number | null; // Set when repeating one exact past entry.
  createdAt: number;
};

// One reversible change, shown in the chat with an Undo button.
export type ChangeRecord = {
  id: string;
  day: string;
  createdAt: number;
  label: string;
  table: "entries" | "days" | "settings" | "customFoods";
  key: string;
  before: unknown;
  after: unknown;
  undone: boolean;
};

class CmacDatabase extends Dexie {
  entries!: Table<Entry, string>;
  days!: Table<Day, string>;
  customFoods!: Table<CustomFood, string>;
  meals!: Table<SavedMeal, string>;
  batches!: Table<Batch, string>;
  settings!: Table<Setting, string>;
  chatMessages!: Table<ChatMessage, string>;
  proposals!: Table<Proposal, string>;
  foodLookups!: Table<FoodLookup, string>;
  changes!: Table<ChangeRecord, string>;

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
    // Tables not listed here carry over unchanged.
    this.version(2).stores({
      chatMessages: "id, day, createdAt",
      proposals: "id, day, status, createdAt",
      foodLookups: "ref",
      changes: "id, day, createdAt",
    });
  }
}

export const db = new CmacDatabase();
