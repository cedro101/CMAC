import { z } from "zod";
import { requirePasscode } from "@/lib/auth";
import { searchUsda } from "@/lib/food/usda";

const RequestBody = z.object({ query: z.string().trim().min(1).max(200) });

export async function POST(request: Request) {
  const denied = requirePasscode(request);
  if (denied) return denied;

  const body = RequestBody.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const foods = await searchUsda(body.data.query);
  return Response.json({ available: foods !== null, foods: foods ?? [] });
}
