import { z } from "zod";

const Macros = z.object({
  kcal: z.number().min(0).nullable(),
  protein: z.number().min(0).nullable(),
  carbs: z.number().min(0).nullable(),
  fat: z.number().min(0).nullable(),
});

const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const Meal = z.enum(["breakfast", "lunch", "dinner", "snack"]);
const RawOrCooked = z.enum(["raw", "cooked"]);

// The order here is sent to Claude, so don't reorder it without a reason:
// changing the tool list mid-conversation drops cached prompts.
export const TOOLS = {
  search_food: {
    description:
      "Search for a food's nutrition. Checks the user's saved foods, then their past log, then USDA, labelling each result with its source. Returns per 100 g values, standard portion weights, and a ref to pass to propose_log.",
    schema: z.object({
      query: z.string().min(1).describe("Plain food words, such as 'chicken breast raw' or 'apple'"),
    }),
  },
  propose_log: {
    description:
      "Show the user a confirm card for one or more foods. Nothing is saved until they tap Confirm. The app calculates all macros for kind 'lookup', so don't supply numbers for those.",
    schema: z.object({
      items: z
        .array(
          z.object({
            food: z.string().min(1).describe("Short display name, such as 'Chicken breast' or 'Lebanese cucumber'"),
            kind: z
              .enum(["lookup", "user_number", "estimate"])
              .describe(
                "lookup: uses a ref from search_food or get_day. user_number: numbers the user stated, such as from a package. estimate: your estimate for a dish no source covers.",
              ),
            ref: z.string().nullable().optional().describe("Required for kind 'lookup'"),
            grams: z.number().positive().nullable().optional(),
            count: z.number().positive().nullable().optional().describe("For counted food, such as 2 apples"),
            size: z.string().nullable().optional().describe("small, medium or large. Leave out for medium."),
            raw_or_cooked: RawOrCooked.nullable().optional().describe("What the stated weight refers to"),
            numbers: Macros.nullable().optional().describe("Only for kind 'user_number' or 'estimate'"),
          }),
        )
        .min(1),
      meal: Meal.nullable().optional(),
      date: DateString.nullable().optional().describe("Logging day. Leave out for today."),
      replaces_card_id: z
        .string()
        .nullable()
        .optional()
        .describe("When correcting a card awaiting confirmation, the card this one replaces"),
    }),
  },
  get_day: {
    description:
      "Get one logging day's entries, totals, weight and incomplete flag. Each entry has an id for edit_entry and delete_entry, and a ref for repeating it through propose_log.",
    schema: z.object({ date: DateString }),
  },
  get_history: {
    description: "Get daily totals and weights for a date range, up to 120 days.",
    schema: z.object({ start: DateString, end: DateString }),
  },
  edit_entry: {
    description:
      "Change an entry that's already saved. If only grams change, the app rescales the macros itself, so don't supply new macros unless the user stated them.",
    schema: z.object({
      id: z.string(),
      changes: z.object({
        food: z.string().min(1).optional(),
        grams: z.number().positive().nullable().optional(),
        raw_or_cooked: RawOrCooked.nullable().optional(),
        kcal: z.number().min(0).nullable().optional(),
        protein: z.number().min(0).nullable().optional(),
        carbs: z.number().min(0).nullable().optional(),
        fat: z.number().min(0).nullable().optional(),
        meal: Meal.nullable().optional(),
        date: DateString.optional(),
      }),
    }),
  },
  delete_entry: {
    description: "Remove a saved entry, only when the user asks. They can undo it from the chat.",
    schema: z.object({ id: z.string() }),
  },
  log_weight: {
    description: "Record the user's body weight in kilograms.",
    schema: z.object({
      kg: z.number().min(20).max(400),
      date: DateString.nullable().optional().describe("Logging day. Leave out for today."),
    }),
  },
  set_goals: {
    description: "Set the user's fixed daily goals. Only when they ask.",
    schema: Macros,
  },
  mark_day_incomplete: {
    description: "Mark whether a day's log is missing food the user didn't record.",
    schema: z.object({ date: DateString, incomplete: z.boolean() }),
  },
  save_custom_food: {
    description: "Save a food the user gives per 100 g numbers for, so future searches find it first.",
    schema: z.object({
      name: z.string().min(1),
      per_100g: Macros,
      serving_g: z.number().positive().nullable().optional(),
    }),
  },
} as const;

export type ToolName = keyof typeof TOOLS;

// Builds the tool list in the shape the Claude API expects.
export function buildToolDefinitions() {
  return Object.entries(TOOLS).map(([name, tool]) => {
    const inputSchema = z.toJSONSchema(tool.schema) as Record<string, unknown>;
    delete inputSchema.$schema;
    return {
      name,
      description: tool.description,
      input_schema: { ...inputSchema, type: "object" as const },
      eager_input_streaming: true,
    };
  });
}
