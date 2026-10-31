"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { backupFileName, buildBackup, markBackupDone } from "@/lib/backup";
import { db } from "@/lib/db";
import { LAST_BACKUP_KEY } from "@/lib/log";

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export default function BackupSection() {
  const [error, setError] = useState<string | null>(null);
  const lastBackup = useLiveQuery(async () => (await db.settings.get(LAST_BACKUP_KEY))?.value as number | undefined, []);

  async function handleExport() {
    setError(null);
    try {
      const backup = await buildBackup();
      const file = new File([JSON.stringify(backup, null, 1)], backupFileName(), { type: "application/json" });

      // Home screen apps on iPhone handle downloads poorly, so use the Share sheet.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        downloadFile(file);
      }
      await markBackupDone();
    } catch (caught) {
      // Closing the Share sheet isn't a failure, but it isn't a backup either.
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      console.error("Export failed", caught);
      setError("The export failed. Try again.");
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-semibold">Back up your data</h2>
      <p className="mt-1 text-sm text-muted">
        Your data is only on this phone. Export a file and choose Save to Files. It includes your food, weights, saved
        foods, meals and goals.
      </p>
      <button type="button" onClick={handleExport} className="mt-3 h-11 w-full rounded-xl bg-accent font-semibold text-black">
        Export data
      </button>
      <p className="mt-2 text-sm text-muted">
        {lastBackup ? `Last backup: ${new Date(lastBackup).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}` : "No backup yet."}
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
