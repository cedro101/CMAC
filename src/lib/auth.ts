import { createHash, timingSafeEqual } from "node:crypto";
import { PASSCODE_HEADER } from "./config";

function sha256(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}

function readSuppliedPasscode(request: Request): string | null {
  const header = request.headers.get(PASSCODE_HEADER);
  if (header === null) return null;
  try {
    return decodeURIComponent(header);
  } catch {
    return null;
  }
}

// Call this first in every API route. It returns the error response to send,
// or null when the request is allowed through.
export function requirePasscode(request: Request): Response | null {
  const expected = process.env.APP_PASSCODE?.trim();
  if (!expected) {
    return Response.json({ error: "passcode_not_configured" }, { status: 503 });
  }

  const supplied = readSuppliedPasscode(request);
  // Hashing makes both sides the same length, as timingSafeEqual requires.
  if (supplied === null || !timingSafeEqual(sha256(supplied), sha256(expected))) {
    return Response.json({ error: "wrong_passcode" }, { status: 401 });
  }

  return null;
}
