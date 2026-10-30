"use client";

import { type FormEvent, type ReactNode, useState, useSyncExternalStore } from "react";
import {
  getStoredPasscode,
  subscribeToPasscode,
  verifyPasscode,
  type VerifyResult,
} from "@/lib/passcode";

const ERROR_MESSAGES: Record<Exclude<VerifyResult, "ok">, string> = {
  wrong: "That passcode isn't right.",
  not_configured: "The server has no passcode set yet. Add APP_PASSCODE in Vercel and redeploy.",
  unreachable: "Couldn't reach the server. Check your connection and try again.",
};

function PasscodePrompt() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const candidate = passcode.trim();
    if (!candidate) return;

    setChecking(true);
    setError(null);
    const result = await verifyPasscode(candidate);
    if (result !== "ok") {
      setError(ERROR_MESSAGES[result]);
      setChecking(false);
    }
  }

  return (
    <div className="pt-safe pb-safe flex h-dvh items-center justify-center px-6">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-center text-3xl font-semibold tracking-tight">CMAC</h1>
        <label className="flex flex-col gap-2">
          <span className="text-sm text-muted">Passcode</span>
          <input
            type="password"
            name="passcode"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="h-12 rounded-xl border border-border bg-surface px-4 outline-none focus:border-accent"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={checking || !passcode.trim()}
          className="h-12 rounded-xl bg-accent font-semibold text-black disabled:opacity-50"
        >
          {checking ? "Checking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}

export default function PasscodeGate({ children }: { children: ReactNode }) {
  // undefined during server rendering, where the browser's storage can't be read.
  const passcode = useSyncExternalStore(subscribeToPasscode, getStoredPasscode, () => undefined);

  if (passcode === undefined) return null;
  if (passcode === null) return <PasscodePrompt />;
  return children;
}
