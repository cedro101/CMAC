import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requirePasscode } from "./auth";
import { PASSCODE_HEADER } from "./config";

function requestWith(passcode?: string): Request {
  const headers = new Headers();
  if (passcode !== undefined) headers.set(PASSCODE_HEADER, passcode);
  return new Request("http://localhost/api/auth/verify", { method: "POST", headers });
}

describe("requirePasscode", () => {
  beforeEach(() => vi.stubEnv("APP_PASSCODE", "correct horse"));
  afterEach(() => vi.unstubAllEnvs());

  it("allows the right passcode", () => {
    expect(requirePasscode(requestWith(encodeURIComponent("correct horse")))).toBeNull();
  });

  it("allows accented characters", () => {
    vi.stubEnv("APP_PASSCODE", "café");
    expect(requirePasscode(requestWith(encodeURIComponent("café")))).toBeNull();
  });

  it("ignores stray whitespace around the configured passcode", () => {
    vi.stubEnv("APP_PASSCODE", "correct horse\n");
    expect(requirePasscode(requestWith(encodeURIComponent("correct horse")))).toBeNull();
  });

  it("rejects a wrong passcode", () => {
    expect(requirePasscode(requestWith("wrong"))?.status).toBe(401);
  });

  it("rejects a missing passcode", () => {
    expect(requirePasscode(requestWith())?.status).toBe(401);
  });

  it("rejects a malformed header", () => {
    expect(requirePasscode(requestWith("%E0%A4%A"))?.status).toBe(401);
  });

  it("rejects everything when no passcode is configured", () => {
    vi.stubEnv("APP_PASSCODE", "");
    expect(requirePasscode(requestWith(""))?.status).toBe(503);
  });
});
