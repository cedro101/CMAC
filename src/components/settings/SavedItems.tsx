"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { type FormEvent, useState } from "react";
import ChangeNotice from "@/components/chat/ChangeNotice";
import Sheet from "@/components/Sheet";
import { db, type ChangeRecord } from "@/lib/db";
import { deleteCustomFood, deleteMeal, renameCustomFood, renameMeal } from "@/lib/log";

type Selected = { kind: "food" | "meal"; id: string; name: string };

function RenameSheet({
  item,
  onRename,
  onRemove,
  onClose,
}: {
  item: Selected;
  onRename: (name: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) onRename(name.trim());
  }

  return (
    <Sheet onClose={onClose}>
      <form role="dialog" aria-label={`Edit ${item.name}`} onSubmit={handleSubmit} className="flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-11 w-full rounded-xl border border-border bg-background px-3 text-foreground outline-none focus:border-accent"
          />
        </label>
        <p className="text-sm text-muted">To change the numbers, tell the chat.</p>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!name.trim()}
            className="h-11 flex-1 rounded-xl bg-accent font-semibold text-black disabled:opacity-50"
          >
            Save
          </button>
          <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-border font-semibold">
            Cancel
          </button>
        </div>
        <button type="button" onClick={onRemove} className="h-11 rounded-xl font-semibold text-danger">
          Remove
        </button>
      </form>
    </Sheet>
  );
}

export default function SavedItems() {
  const foods = useLiveQuery(() => db.customFoods.orderBy("name").toArray(), []);
  const meals = useLiveQuery(() => db.meals.orderBy("name").toArray(), []);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [lastChange, setLastChange] = useState<ChangeRecord | null>(null);
  const liveChange = useLiveQuery(async () => (lastChange ? db.changes.get(lastChange.id) : undefined), [lastChange]);

  async function showLastChange() {
    setLastChange((await db.changes.orderBy("createdAt").last()) ?? null);
  }

  async function handleRename(name: string) {
    if (!selected) return;
    if (selected.kind === "food") await renameCustomFood(selected.id, name);
    else await renameMeal(selected.id, name);
    if (name !== selected.name) await showLastChange();
    setSelected(null);
  }

  async function handleRemove() {
    if (!selected) return;
    if (selected.kind === "food") await deleteCustomFood(selected.id);
    else await deleteMeal(selected.id);
    await showLastChange();
    setSelected(null);
  }

  const rowClass = "flex w-full items-center justify-between gap-3 py-2.5 text-left";

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Saved foods</h2>
      {foods?.length === 0 && <p className="mt-1 text-sm text-muted">None yet.</p>}
      <div className="divide-y divide-border">
        {foods?.map((food) => (
          <button
            key={food.id}
            type="button"
            onClick={() => setSelected({ kind: "food", id: food.id, name: food.name })}
            className={rowClass}
          >
            <span className="min-w-0 text-sm">{food.name}</span>
            <span className="shrink-0 text-right text-xs tabular-nums text-muted">
              {food.per100g.kcal ?? "–"} kcal · P {food.per100g.protein ?? "–"} g
              <span className="block">per 100 g</span>
            </span>
          </button>
        ))}
      </div>

      <h2 className="mt-4 font-semibold">Saved meals</h2>
      {meals?.length === 0 && (
        <p className="mt-1 text-sm text-muted">None yet. Tell the chat something like &quot;save that as my usual breakfast&quot;.</p>
      )}
      <div className="divide-y divide-border">
        {meals?.map((meal) => (
          <button
            key={meal.id}
            type="button"
            onClick={() => setSelected({ kind: "meal", id: meal.id, name: meal.name })}
            className={rowClass}
          >
            <span className="min-w-0 text-sm">{meal.name}</span>
            <span className="shrink-0 text-xs text-muted">
              {meal.items.length} {meal.items.length === 1 ? "item" : "items"}
            </span>
          </button>
        ))}
      </div>

      {liveChange && (
        <div className="mt-3">
          <ChangeNotice change={liveChange} />
        </div>
      )}

      {selected && (
        <RenameSheet
          key={selected.id}
          item={selected}
          onRename={handleRename}
          onRemove={handleRemove}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
