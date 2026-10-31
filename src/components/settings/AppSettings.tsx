"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { type FormEvent, useState } from "react";
import { CLAUDE_MODEL } from "@/lib/config";
import { db } from "@/lib/db";
import { MODEL_KEY } from "@/lib/log";
import { verifyPasscode } from "@/lib/passcode";

const FIELD_CLASS =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-foreground outline-none focus:border-accent";

function PasscodeForm() {
  const [passcode, setPasscode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const candidate = passcode.trim();
    if (!candidate) return;
    const result = await verifyPasscode(candidate);
    setMessage(
      result === "ok"
        ? "Passcode updated on this phone."
        : result === "wrong"
          ? "That doesn't match the passcode on the server."
          : "Couldn't reach the server. Try again.",
    );
    if (result === "ok") setPasscode("");
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="flex flex-col gap-1 text-sm text-muted">
        Passcode
        <input
          type="password"
          value={passcode}
          onChange={(event) => setPasscode(event.target.value)}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={FIELD_CLASS}
        />
      </label>
      <p className="mt-1 text-xs text-muted">
        This updates the passcode this phone uses. The real one is set in Vercel, so change it there first.
      </p>
      <button type="submit" disabled={!passcode.trim()} className="mt-2 h-11 w-full rounded-xl border border-border text-sm font-semibold disabled:opacity-50">
        Update passcode
      </button>
      {message && (
        <p role="status" className="mt-2 text-sm text-muted">
          {message}
        </p>
      )}
    </form>
  );
}

function ModelForm({ saved }: { saved: string | null }) {
  const [model, setModel] = useState(saved ?? CLAUDE_MODEL);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const name = model.trim();
    if (!/^claude-[a-z0-9.-]+$/.test(name)) {
      setMessage("Enter a Claude model name, such as claude-sonnet-5-5.");
      return;
    }
    if (name === CLAUDE_MODEL) await db.settings.delete(MODEL_KEY);
    else await db.settings.put({ key: MODEL_KEY, value: name });
    setMessage("Model saved. The next message will use it.");
  }

  return (
    <form onSubmit={handleSubmit}>
      <label className="flex flex-col gap-1 text-sm text-muted">
        Claude model
        <input
          value={model}
          onChange={(event) => {
            setModel(event.target.value);
            setMessage(null);
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={FIELD_CLASS}
        />
      </label>
      <p className="mt-1 text-xs text-muted">The default is {CLAUDE_MODEL}. A different model may cost more.</p>
      <div className="mt-2 flex gap-2">
        <button type="submit" className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold">
          Save model
        </button>
        <button
          type="button"
          onClick={async () => {
            setModel(CLAUDE_MODEL);
            await db.settings.delete(MODEL_KEY);
            setMessage("Back to the default model.");
          }}
          className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold"
        >
          Use default
        </button>
      </div>
      {message && (
        <p role="status" className="mt-2 text-sm text-muted">
          {message}
        </p>
      )}
    </form>
  );
}

export default function AppSettings() {
  const saved = useLiveQuery(async () => ((await db.settings.get(MODEL_KEY))?.value as string | undefined) ?? null, []);

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">App</h2>
      <PasscodeForm />
      {saved !== undefined && <ModelForm saved={saved} />}
    </section>
  );
}
