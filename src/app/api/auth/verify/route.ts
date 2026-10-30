import { requirePasscode } from "@/lib/auth";

export async function POST(request: Request) {
  const denied = requirePasscode(request);
  if (denied) return denied;
  return Response.json({ ok: true });
}
