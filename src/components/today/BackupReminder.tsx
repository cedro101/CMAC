"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { db } from "@/lib/db";
import { LAST_BACKUP_KEY } from "@/lib/log";

const REMIND_AFTER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export default function BackupReminder() {
  // Null means no reminder is needed.
  const daysSinceBackup = useLiveQuery(async () => {
    if ((await db.entries.count()) === 0) return null;
    const last = (await db.settings.get(LAST_BACKUP_KEY))?.value as number | undefined;
    if (last === undefined) return Infinity;
    const days = Math.floor((Date.now() - last) / DAY_MS);
    return days >= REMIND_AFTER_DAYS ? days : null;
  }, []);

  if (daysSinceBackup === undefined || daysSinceBackup === null) return null;

  return (
    <Link href="/settings" className="mx-4 mt-2 flex items-center justify-between gap-3 rounded-xl border border-warning/50 px-3 py-2 text-sm">
      <span>
        {daysSinceBackup === Infinity
          ? "You haven't backed up your data yet."
          : `Your last backup was ${daysSinceBackup} days ago.`}
      </span>
      <span className="shrink-0 font-semibold text-accent">Back up</span>
    </Link>
  );
}
