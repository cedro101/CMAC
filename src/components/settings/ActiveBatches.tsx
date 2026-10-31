"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import ChangeNotice from "@/components/chat/ChangeNotice";
import { db, type Batch } from "@/lib/db";
import { isBatchActive, per100gCooked } from "@/lib/food/batch";
import { deleteBatch } from "@/lib/log";

function formatExpiry(batch: Batch): string {
  if (batch.expiresAt === null) return "No expiry";
  const date = new Date(batch.expiresAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  return `Expires ${date}`;
}

export default function ActiveBatches() {
  const batches = useLiveQuery(async () => {
    const now = Date.now();
    return (await db.batches.orderBy("name").toArray()).filter((batch) => isBatchActive(batch, now));
  }, []);
  const [lastChangeId, setLastChangeId] = useState<string | null>(null);
  const lastChange = useLiveQuery(async () => (lastChangeId ? db.changes.get(lastChangeId) : undefined), [lastChangeId]);

  async function handleRemove(id: string) {
    await deleteBatch(id);
    setLastChangeId((await db.changes.orderBy("createdAt").last())?.id ?? null);
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Active batches</h2>
      {batches?.length === 0 && (
        <p className="mt-1 text-sm text-muted">
          None. Tell the chat something like &quot;1078 g raw chicken became 850 g cooked&quot;.
        </p>
      )}
      <div className="divide-y divide-border">
        {batches?.map((batch) => {
          const per100g = per100gCooked(batch);
          return (
            <div key={batch.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm">{batch.name}</p>
                <p className="text-xs text-muted">
                  {batch.rawG} g raw → {batch.cookedG} g cooked · {formatExpiry(batch)}
                </p>
                <p className="text-xs tabular-nums text-muted">
                  Per 100 g cooked: {per100g.kcal === null ? "–" : Math.round(per100g.kcal)} kcal, P{" "}
                  {per100g.protein === null ? "–" : per100g.protein.toFixed(1)} g
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(batch.id)}
                aria-label={`Remove ${batch.name}`}
                className="h-9 shrink-0 text-sm font-semibold text-danger"
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>
      {lastChange && (
        <div className="mt-2">
          <ChangeNotice change={lastChange} />
        </div>
      )}
    </section>
  );
}
