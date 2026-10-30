"use client";

import { useEffect, useState } from "react";
import { dayKey } from "@/lib/dates";
import { db } from "@/lib/db";

// Temporary card for the step 1 phone test. Remove it with the real Settings screen.
const TEST_FOOD = "__storage_check__";

async function readStatus() {
  return {
    count: await db.entries.where("food").equals(TEST_FOOD).count(),
    persisted: (await navigator.storage?.persisted?.()) ?? false,
  };
}

export default function StorageCheck() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof readStatus>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readStatus().then(setStatus, (caught) => setError(String(caught)));
  }, []);

  async function refresh() {
    setStatus(await readStatus());
  }

  async function addTestEntry() {
    await db.entries.add({
      id: crypto.randomUUID(),
      date: dayKey(),
      food: TEST_FOOD,
      grams: null,
      rawOrCooked: null,
      kcal: null,
      protein: null,
      carbs: null,
      fat: null,
      meal: null,
      estimate: false,
      source: "user",
      timestamp: Date.now(),
    });
    await refresh();
  }

  async function clearTestEntries() {
    await db.entries.where("food").equals(TEST_FOOD).delete();
    await refresh();
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Storage check</h2>
      <dl className="mt-3 flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">Test entries saved</dt>
          <dd>{status?.count ?? "…"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Persistent storage</dt>
          <dd>{!status ? "…" : status.persisted ? "Granted" : "Not granted"}</dd>
        </div>
      </dl>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={addTestEntry}
          className="h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-black"
        >
          Add test entry
        </button>
        <button
          type="button"
          onClick={clearTestEntries}
          className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold"
        >
          Clear
        </button>
      </div>
    </section>
  );
}
