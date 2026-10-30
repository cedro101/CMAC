import { PASSCODE_HEADER } from "./config";

const STORAGE_KEY = "cmac.passcode";
const listeners = new Set<() => void>();

export function getStoredPasscode(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function subscribeToPasscode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function storePasscode(passcode: string | null) {
  if (passcode === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, passcode);
  listeners.forEach((listener) => listener());
}

// Headers can't hold every character, so the passcode is URL-encoded.
function passcodeHeaders(passcode: string): HeadersInit {
  return { [PASSCODE_HEADER]: encodeURIComponent(passcode) };
}

export type VerifyResult = "ok" | "wrong" | "not_configured" | "unreachable";

// Checks a passcode with the server and remembers it when it's correct.
export async function verifyPasscode(passcode: string): Promise<VerifyResult> {
  let response: Response;
  try {
    response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: passcodeHeaders(passcode),
    });
  } catch {
    return "unreachable";
  }

  if (response.ok) {
    storePasscode(passcode);
    return "ok";
  }
  if (response.status === 401) return "wrong";
  if (response.status === 503) return "not_configured";
  return "unreachable";
}

// Use this for every API call. A 401 means the passcode changed on the server,
// so forgetting it brings the passcode screen back.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  new Headers(passcodeHeaders(getStoredPasscode() ?? "")).forEach((value, name) => {
    headers.set(name, value);
  });

  const response = await fetch(path, { ...init, headers });
  if (response.status === 401) storePasscode(null);
  return response;
}
