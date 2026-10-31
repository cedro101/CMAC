import { z } from "zod";
import { dayKey, isValidDateKey } from "./dates";
import { db, type Batch, type CustomFood, type Day, type Entry, type SavedMeal, type Setting } from "./db";
import { LAST_BACKUP_KEY } from "./log";

const BACKUP_APP = "cmac";
const BACKUP_VERSION = 1;

// Checks what the app relies on, and keeps anything extra such as micronutrients.
const BackupFile = z.object({
  app: z.literal(BACKUP_APP),
  version: z.number(),
  exportedAt: z.number(),
  entries: z.array(
    z.looseObject({
      id: z.string().min(1),
      date: z.string().refine(isValidDateKey),
      food: z.string(),
      timestamp: z.number(),
    }),
  ),
  days: z.array(z.looseObject({ date: z.string().refine(isValidDateKey) })),
  customFoods: z.array(z.looseObject({ id: z.string().min(1), name: z.string() })),
  meals: z.array(z.looseObject({ id: z.string().min(1), name: z.string() })),
  batches: z.array(z.looseObject({ id: z.string().min(1), name: z.string() })),
  settings: z.array(z.looseObject({ key: z.string().min(1) })),
});

export type Backup = z.infer<typeof BackupFile>;

// Holds your food, weights, saved foods, meals, batches and goals. The passcode
// isn't in the database, and chats aren't needed to restore your data.
export async function buildBackup(): Promise<Backup> {
  const [entries, days, customFoods, meals, batches, settings] = await Promise.all([
    db.entries.toArray(),
    db.days.toArray(),
    db.customFoods.toArray(),
    db.meals.toArray(),
    db.batches.toArray(),
    db.settings.toArray(),
  ]);
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    entries,
    days,
    customFoods,
    meals,
    batches,
    settings: settings.filter((setting) => setting.key !== LAST_BACKUP_KEY),
  };
}

export function backupFileName(): string {
  return `cmac-backup-${dayKey()}.json`;
}

export async function markBackupDone(): Promise<void> {
  await db.settings.put({ key: LAST_BACKUP_KEY, value: Date.now() });
}

export type BackupParseResult = { ok: true; backup: Backup } | { ok: false; errors: string[] };

export function isBackupFile(json: unknown): boolean {
  return (json as { app?: unknown })?.app === BACKUP_APP;
}

export function parseBackup(json: unknown): BackupParseResult {
  const parsed = BackupFile.safeParse(json);
  if (parsed.success) return { ok: true, backup: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "File"}: ${issue.message}`),
  };
}

export type RestoreResult = { added: number; skipped: number };

// Adds what's missing and never overwrites, so an old backup can't undo newer
// changes. Something removed since the backup does come back.
export async function restoreBackup(backup: Backup): Promise<RestoreResult> {
  return db.transaction("rw", [db.entries, db.days, db.customFoods, db.meals, db.batches, db.settings], async () => {
    let added = 0;
    let skipped = 0;

    async function addMissing<Row, Key extends string>(
      table: { bulkGet: (keys: Key[]) => Promise<(Row | undefined)[]>; bulkAdd: (rows: Row[]) => Promise<unknown> },
      rows: Row[],
      keyOf: (row: Row) => Key,
    ) {
      const existing = await table.bulkGet(rows.map(keyOf));
      const missing = rows.filter((_, index) => existing[index] === undefined);
      if (missing.length > 0) await table.bulkAdd(missing);
      added += missing.length;
      skipped += rows.length - missing.length;
    }

    await addMissing(db.entries, backup.entries as unknown as Entry[], (row) => row.id);
    await addMissing(db.days, backup.days as unknown as Day[], (row) => row.date);
    await addMissing(db.customFoods, backup.customFoods as unknown as CustomFood[], (row) => row.id);
    await addMissing(db.meals, backup.meals as unknown as SavedMeal[], (row) => row.id);
    await addMissing(db.batches, backup.batches as unknown as Batch[], (row) => row.id);
    await addMissing(db.settings, backup.settings as unknown as Setting[], (row) => row.key);

    return { added, skipped };
  });
}
