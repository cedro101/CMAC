"use client";

import { useState } from "react";
import type { ChangeRecord } from "@/lib/db";
import { undoChange } from "@/lib/log";

export default function ChangeNotice({ change }: { change: ChangeRecord }) {
  const [failed, setFailed] = useState(false);

  async function handleUndo() {
    setFailed(!(await undoChange(change.id)));
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-sm">
      <span className={change.undone ? "text-muted line-through" : "text-muted"}>{change.label}</span>
      {change.undone ? (
        <span className="shrink-0 text-muted">Undone</span>
      ) : failed ? (
        <span className="shrink-0 text-danger">Changed since</span>
      ) : (
        <button type="button" onClick={handleUndo} className="h-8 shrink-0 font-semibold text-accent">
          Undo
        </button>
      )}
    </div>
  );
}
