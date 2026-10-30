import type { RawOrCooked } from "../db";

// Foods whose kcal per gram changes a lot between raw and cooked. Add to this
// list to make the bot ask about more foods.
const NEEDS_RAW_OR_COOKED =
  /\b(chicken|turkey|beef|lamb|pork|veal|duck|steak|mince|bacon|sausages?|salmon|tuna|shrimp|prawns?|fish|rice|pasta|spaghetti|penne|macaroni|noodles?|potato(es)?|fries)\b/i;

// Foods that match the list above but have no raw or cooked version.
const EXCEPTIONS = /\b(rice cakes?|rice krispies|potato chips|potato crisps|broth|stock)\b/i;

export function needsRawOrCooked(food: string): boolean {
  return NEEDS_RAW_OR_COOKED.test(food) && !EXCEPTIONS.test(food);
}

const COOKED_WORDS = /\b(cooked|roasted|boiled|grilled|baked|steamed|braised|microwaved)\b/i;
const RAW_WORDS = /\b(raw|uncooked)\b/i;

// Works out the state from what you called a food, such as "Chicken breast
// (raw weight)". "Frozen" and "air fried" don't count, because fries called
// either could have been weighed before or after air frying.
export function inferRawOrCooked(name: string): RawOrCooked | null {
  if (RAW_WORDS.test(name)) return "raw";
  if (COOKED_WORDS.test(name)) return "cooked";
  return null;
}

// Works out the state of a USDA record, such as "French fries, frozen,
// unprepared". Cooked words win because USDA writes "Apples, raw, cooked, boiled".
export function inferUsdaState(name: string): RawOrCooked | null {
  if (COOKED_WORDS.test(name) || /\b(fried|heated)\b/i.test(name)) return "cooked";
  if (RAW_WORDS.test(name) || /\b(unprepared|frozen)\b/i.test(name)) return "raw";
  return null;
}
