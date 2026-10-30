import { parseUsdaFoods, parseUsdaPortions, type UsdaFood } from "./usdaParse";

const USDA_BASE_URL = "https://api.nal.usda.gov/fdc/v1";
const TIMEOUT_MS = 8000;
const PAGE_SIZE = 8;

async function postToUsda(path: string, body: unknown, apiKey: string): Promise<unknown> {
  const response = await fetch(`${USDA_BASE_URL}${path}?api_key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`USDA responded with ${response.status}`);
  return response.json();
}

// Returns null when USDA can't be reached, so that search still works from
// saved foods and past logs.
export async function searchUsda(query: string): Promise<UsdaFood[] | null> {
  const apiKey = process.env.USDA_API_KEY?.trim();
  if (!apiKey) {
    console.error("USDA_API_KEY is not set");
    return null;
  }

  let foods: UsdaFood[];
  try {
    foods = parseUsdaFoods(
      await postToUsda(
        "/foods/search",
        { query, dataType: ["Foundation", "SR Legacy"], pageSize: PAGE_SIZE },
        apiKey,
      ),
    );
  } catch (error) {
    console.error("USDA search failed", error);
    return null;
  }

  if (foods.length === 0) return foods;

  // Portion weights aren't in search results. Without them, foods still work
  // when given in grams.
  try {
    const portions = parseUsdaPortions(
      await postToUsda("/foods", { fdcIds: foods.map((food) => food.fdcId), format: "full" }, apiKey),
    );
    return foods.map((food) => ({ ...food, portions: portions.get(food.fdcId) ?? [] }));
  } catch (error) {
    console.error("USDA portion lookup failed", error);
    return foods;
  }
}
