"use client";

import type { FoodCard, Macros } from "@/lib/db";
import { cancelFoodCard, confirmFoodCard } from "@/lib/log";

function MacroRow({ label, macros }: { label: string; macros: Macros }) {
  const value = (amount: number | null, unit = "g") => (amount === null ? "–" : `${amount}${unit}`);
  return (
    <div className="py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 text-sm tabular-nums">
        <span className="font-semibold">{value(macros.kcal, " kcal")}</span>
        <span className="text-muted">
          {" "}
          · P {value(macros.protein)} · C {value(macros.carbs)} · F {value(macros.fat)}
        </span>
      </p>
    </div>
  );
}

export default function LabelFoodCard({ card }: { card: FoodCard }) {
  if (card.status !== "pending") {
    const message =
      card.status === "saved" ? "Saved food" : card.status === "replaced" ? "Replaced by a newer card" : "Cancelled";
    return (
      <p className="rounded-xl border border-border px-3 py-2 text-sm text-muted">
        {message}: {card.name}
      </p>
    );
  }

  return (
    <section aria-label="Confirm label" className="rounded-2xl border border-accent/50 bg-surface px-4 pb-3 pt-3">
      <p className="font-medium">{card.name}</p>
      <div className="divide-y divide-border">
        {card.perServing && (
          <MacroRow label={`Per serving${card.servingG ? ` (${card.servingG} g)` : ""}`} macros={card.perServing} />
        )}
        <MacroRow label="Per 100 g" macros={card.per100g} />
      </div>
      <p className="text-xs text-muted">Check these against the label. If one is wrong, tell the chat.</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => confirmFoodCard(card.id)}
          className="h-11 flex-1 rounded-xl bg-accent font-semibold text-black"
        >
          Save food
        </button>
        <button
          type="button"
          onClick={() => cancelFoodCard(card.id)}
          className="h-11 flex-1 rounded-xl border border-border font-semibold"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
