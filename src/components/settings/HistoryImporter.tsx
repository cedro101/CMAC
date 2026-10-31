"use client";

import { type ChangeEvent, useState } from "react";
import { importHistory, parseHistoryFile, type ImportResult, type ParseResult } from "@/lib/importHistory";

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export default function HistoryImporter() {
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clearing the input lets the same file be picked again.
    event.target.value = "";
    if (!file) return;
    setResult(null);
    setSaveError(null);
    setParsed(parseHistoryFile(await file.text()));
  }

  async function handleImport() {
    if (!parsed?.ok) return;
    setSaving(true);
    setSaveError(null);
    try {
      setResult(await importHistory(parsed.history));
      setParsed(null);
    } catch (error) {
      console.error("Import failed", error);
      setSaveError("The import failed, and nothing was saved. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Import history</h2>
      <p className="mt-1 text-sm text-muted">
        Add your past logs from a JSON file. Nothing is saved until you confirm the preview, and importing the same file
        twice won&apos;t create duplicates.
      </p>

      <label className="mt-3 flex h-11 items-center justify-center rounded-xl border border-border text-sm font-semibold">
        Choose file
        <input type="file" accept=".json,application/json,text/plain" onChange={handleFile} className="sr-only" />
      </label>

      {parsed && !parsed.ok && (
        <div role="alert" className="mt-3 text-sm text-danger">
          <p className="font-semibold">This file can&apos;t be imported:</p>
          <ul className="mt-1 list-disc pl-5">
            {parsed.errors.map((error) => (
              <li key={error} className="break-words">
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {parsed?.ok && (
        <div className="mt-3">
          <dl className="flex flex-col gap-1.5 text-sm">
            {[
              ["Days", parsed.preview.days],
              ["Entries", parsed.preview.entries],
              ["Weights", parsed.preview.weights],
              ["Saved foods", parsed.preview.savedFoods],
              ["Date range", parsed.preview.firstDate ? `${parsed.preview.firstDate} to ${parsed.preview.lastDate}` : "None"],
            ].map(([label, value]) => (
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
              onClick={() => setParsed(null)}
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
          Imported {result.entriesAdded} {result.entriesAdded === 1 ? "entry" : "entries"},{" "}
          {plural(result.weightsAdded, "weight")} and {plural(result.foodsAdded, "saved food")}.
          {result.entriesSkipped + result.foodsSkipped > 0 &&
            ` Skipped ${result.entriesSkipped + result.foodsSkipped} already on this phone.`}
        </p>
      )}
    </section>
  );
}
