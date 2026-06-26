/** Pure helpers for the migration runner. Kept separate so they can be unit-tested without env vars or a DB. */

/**
 * Returns the migration filenames that should be applied, in execution order.
 *
 * Rules:
 *  - Only `.sql` files are considered.
 *  - Already-applied filenames (present in `applied`) are skipped.
 *  - Result is sorted alphabetically — file names use a leading 4-digit number,
 *    so alphabetic sort coincides with intended chronological order.
 *
 * @param allFiles - List of every filename in the migrations directory.
 * @param applied - Set of filenames that the `schema_migrations` table reports as already applied.
 * @returns Filenames to run next, oldest first.
 */
export function selectPendingMigrations(allFiles: string[], applied: Set<string>): string[] {
  return allFiles
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => !applied.has(f))
    .sort();
}
