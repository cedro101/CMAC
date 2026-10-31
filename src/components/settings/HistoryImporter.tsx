"use client";

import { type ChangeEvent, useState } from "react";
import { isBackupFile, parseBackup, restoreBackup, type Backup } from "@/lib/backup";
import { importHistory, parseHistoryFile, type ParsedHistory } from "@/lib/importHistory";

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

type Selected =
  | { kind: "history"; history: ParsedHistory; rows: [string, string | number][] }
  | { kind: "backup"; backup: Backup; rows: [string, string | number][] }
  | { kind: "invalid"; errors: string[] };

// Handles both a backup from Export data and the original history file.
function readFile(text: string): Selected {
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // parseHistoryFile reports invalid JSON below.
  }

  if (isBackupFile(json)) {
    const parsed = parseBackup(json);
    if (!parsed.ok) return { kind: "invalid", errors: parsed.errors };
    const { backup } = parsed;
    return {
      kind: "backup",
      backup,
      rows: [
        ["Backup from", new Date(backup.exportedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })],
        ["Entries", backup.entries.length],
        ["Days", backup.days.length],
        ["Saved foods", backup.customFoods.length],
        ["Saved meals", backup.meals.length],
      ],
    };
  }

  const parsed = parseHistoryFile(text);
  if (!parsed.ok) return { kind: "invalid", errors: parsed.errors };
  const { preview } = parsed;
  return {
    kind: "history",
    history: parsed.history,
    rows: [
      ["Days", preview.days],
      ["Entries", preview.entries],
      ["Weights", preview.weights],
      ["Saved foods", preview.savedFoods],
      ["Date range", preview.firstDate ? `${preview.firstDate} to ${preview.lastDate}` : "None"],
    ],
  };
}

export default function HistoryImporter() {
  const [selected, setSelected] = useState<Selected | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clearing the input lets the same file be picked again.
    event.target.value = "";
    if (!file) return;
    setResult(null);
    setSaveError(null);
    setSelected(readFile(await file.text()));
  }

  async function handleImport() {
    if (!selected || selected.kind === "invalid") return;
    setSaving(true);
    setSaveError(null);
    try {
      if (selected.kind === "backup") {
        const restored = await restoreBackup(selected.backup);
        setResult(`Restored ${plural(restored.added, "item")}. Skipped ${restored.skipped} already on this phone.`);
      } else {
        const imported = await importHistory(selected.history);
        const skipped = imported.entriesSkipped + imported.foodsSkipped;
        setResult(
          `Imported ${imported.entriesAdded} ${imported.entriesAdded === 1 ? "entry" : "entries"}, ${plural(imported.weightsAdded, "weight")} and ${plural(imported.foodsAdded, "saved food")}.${skipped > 0 ? ` Skipped ${skipped} already on this phone.` : ""}`,
        );
      }
      setSelected(null);
    } catch (error) {
      console.error("Import failed", error);
      setSaveError("The import failed, and nothing was saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Import data</h2>
      <p className="mt-1 text-sm text-muted">
        Restore a backup or add your history file. Nothing changes until you confirm, and nothing on this phone is
        overwritten or duplicated. Anything you removed comes back if it&apos;s in the file.
      </p>

      <label className="mt-3 flex h-11 items-center justify-center rounded-xl border border-border text-sm font-semibold">
        Choose file
        <input type="file" accept=".json,application/json,text/plain" onChange={handleFile} className="sr-only" />
      </label>

      {selected?.kind === "invalid" && (
        <div role="alert" className="mt-3 text-sm text-danger">
          <p className="font-semibold">This file can&apos;t be imported:</p>
          <ul className="mt-1 list-disc pl-5">
            {selected.errors.map((error) => (
              <li key={error} className="break-words">
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {selected && selected.kind !== "invalid" && (
        <div className="mt-3">
          <dl className="flex flex-col gap-1.5 text-sm">
            {selected.rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4">
                <dt className="text-muted">{label}</dt>
                <dd className="tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleImport}
              disabled={saving}
              className="h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-black disabled:opacity-50"
            >
              {saving ? "Saving…" : "Import"}
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="h-11 flex-1 rounded-xl border border-border text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {saveError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {saveError}
        </p>
      )}
      {result && (
        <p role="status" className="mt-3 text-sm">
          {result}
        </p>
      )}
    </section>
  );
}
