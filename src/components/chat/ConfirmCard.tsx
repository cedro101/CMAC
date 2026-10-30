"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, type Entry, type FoodSource, type Macros, type Proposal, type ProposalItem } from "@/lib/db";
import {
  cancelProposal,
  confirmProposal,
  deleteEntry,
  editEntry,
  editPendingItem,
  removePendingItem,
} from "@/lib/log";
import { sumMacros } from "@/lib/macros";
import EditFoodSheet, { type FoodChanges } from "./EditFoodSheet";

const SOURCE_LABELS: Record<FoodSource, string> = {
  saved: "Saved food",
  history: "History",
  usda: "USDA",
  estimate: "Estimate",
  user: "Your number",
  imported: "Imported",
};

function formatMacro(value: number | null, unit = "g"): string {
  return value === null ? "–" : `${value}${unit}`;
}

function MacroLine({ macros }: { macros: Macros }) {
  return (
    <p className="mt-1 text-sm tabular-nums">
      <span className="font-semibold">{formatMacro(macros.kcal, " kcal")}</span>
      <span className="text-muted">
        {" "}
        · P {formatMacro(macros.protein)} · C {formatMacro(macros.carbs)} · F {formatMacro(macros.fat)}
      </span>
    </p>
  );
}

function FoodRow({
  food,
  action,
}: {
  food: Pick<ProposalItem, "food" | "grams" | "rawOrCooked" | "portion" | "source" | "estimate"> & Macros;
  action?: React.ReactNode;
}) {
  const amount = [food.grams === null ? null : `${food.grams} g`, food.rawOrCooked].filter(Boolean).join(" ");
  return (
    <div className="py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium">{food.food}</p>
        {action}
      </div>
      {(amount || food.portion) && (
        <p className="text-sm text-muted">{[amount, food.portion].filter(Boolean).join(" · ")}</p>
      )}
      <MacroLine macros={food} />
      <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-md bg-border px-1.5 py-0.5 text-muted">{SOURCE_LABELS[food.source]}</span>
        {food.estimate && food.source !== "estimate" && (
          <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-amber-300">Estimate</span>
        )}
        {food.source === "estimate" && (
          <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-amber-300">Not from a database</span>
        )}
      </div>
    </div>
  );
}

function Totals({ items }: { items: Macros[] }) {
  const totals = sumMacros(items);
  // "+" means some items are missing this macro, and "–" means all of them are.
  const format = ({ value, partial }: { value: number; partial: boolean }, unit: string) =>
    partial && value === 0 ? "–" : `${value}${partial ? "+" : ""}${unit}`;
  return (
    <p className="border-t border-border pt-2.5 text-sm tabular-nums">
      <span className="font-semibold">Total {format(totals.kcal, " kcal")}</span>
      <span className="text-muted">
        {" "}
        · P {format(totals.protein, "g")} · C {format(totals.carbs, "g")} · F {format(totals.fat, "g")}
      </span>
    </p>
  );
}

function PendingCard({ proposal }: { proposal: Proposal }) {
  const [editing, setEditing] = useState<ProposalItem | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    setSaving(true);
    await confirmProposal(proposal.id);
    setSaving(false);
  }

  async function handleSave(changes: FoodChanges) {
    if (editing) await editPendingItem(proposal.id, editing.id, changes);
    setEditing(null);
  }

  async function handleRemove() {
    if (editing) await removePendingItem(proposal.id, editing.id);
    setEditing(null);
  }

  return (
    <section aria-label="Confirm food log" className="rounded-2xl border border-accent/50 bg-surface px-4 pb-3 pt-2">
      <div className="divide-y divide-border">
        {proposal.items.map((item) => (
          <FoodRow
            key={item.id}
            food={item}
            action={
              <button
                type="button"
                onClick={() => setEditing(item)}
                aria-label={`Edit ${item.food}`}
                className="-mr-1 h-7 shrink-0 px-1 text-sm font-semibold text-accent"
              >
                Edit
              </button>
            }
          />
        ))}
      </div>
      <Totals items={proposal.items} />
      <p className="mt-1 text-xs text-muted">
        Not saved yet{proposal.meal ? ` · ${proposal.meal}` : ""}
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={saving}
          className="h-11 flex-1 rounded-xl bg-accent font-semibold text-black disabled:opacity-50"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => cancelProposal(proposal.id)}
          className="h-11 flex-1 rounded-xl border border-border font-semibold"
        >
          Cancel
        </button>
      </div>
      {editing && (
        <EditFoodSheet food={editing} onSave={handleSave} onRemove={handleRemove} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

function ConfirmedCard({ proposal }: { proposal: Proposal }) {
  const [editing, setEditing] = useState<Entry | null>(null);
  const entryIds = proposal.items.flatMap((item) => (item.entryId ? [item.entryId] : []));
  const entries = useLiveQuery(() => db.entries.bulkGet(entryIds), [proposal.id]);

  async function handleSave(changes: FoodChanges) {
    if (editing) await editEntry(editing.id, changes);
    setEditing(null);
  }

  async function handleRemove() {
    if (editing) await deleteEntry(editing.id);
    setEditing(null);
  }

  if (!entries) return null;
  const saved = entries.filter((entry): entry is Entry => entry !== undefined);

  return (
    <section aria-label="Saved food log" className="rounded-2xl border border-border bg-surface px-4 pb-3 pt-2">
      {saved.length > 0 ? (
        <div className="divide-y divide-border">
          {saved.map((entry) => (
            <FoodRow
              key={entry.id}
              food={{ ...entry, portion: entry.portion ?? null }}
              action={
                <button
                  type="button"
                  onClick={() => setEditing(entry)}
                  aria-label={`Edit ${entry.food}`}
                  className="-mr-1 h-7 shrink-0 px-1 text-sm font-semibold text-accent"
                >
                  Edit
                </button>
              }
            />
          ))}
        </div>
      ) : (
        <p className="py-2 text-sm text-muted">Everything on this card was removed.</p>
      )}
      {saved.length > 1 && <Totals items={saved} />}
      <p className="mt-1 text-xs text-accent">Saved{proposal.meal ? ` · ${proposal.meal}` : ""}</p>
      {editing && (
        <EditFoodSheet
          food={editing}
          showMeal
          onSave={handleSave}
          onRemove={handleRemove}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

export default function ConfirmCard({ proposal }: { proposal: Proposal }) {
  if (proposal.status === "pending") return <PendingCard proposal={proposal} />;
  if (proposal.status === "confirmed") return <ConfirmedCard proposal={proposal} />;

  const names = proposal.items.map((item) => item.food).join(", ");
  return (
    <p className="rounded-xl border border-border px-3 py-2 text-sm text-muted">
      {proposal.status === "replaced" ? "Replaced by a newer card" : "Cancelled"}
      {names ? `: ${names}` : ""}
    </p>
  );
}
