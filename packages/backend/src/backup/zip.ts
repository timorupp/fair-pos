/** Wraps a raw `pg_dump` SQL dump into a downloadable ZIP archive. */
import { ZipArchive } from 'archiver';

/**
 * Packages a SQL dump plus a short restore-instructions README into a ZIP.
 *
 * @param sqlDump - The raw `pg_dump` output (see `backup/dump.ts`).
 * @param createdAt - Timestamp to record in the README.
 * @returns The complete ZIP archive as a Buffer.
 */
export async function buildBackupZip(sqlDump: Buffer, createdAt: Date): Promise<Buffer> {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => {
    archive.on('end', resolve);
    archive.on('error', reject);
  });

  archive.append(sqlDump, { name: 'backup.sql' });
  archive.append(
    `FairPOS-Datenbank-Backup, erstellt am ${createdAt.toISOString()}.\n\n`
    + 'Wiederherstellung:\n'
    + '  1. Leere Zieldatenbank anlegen (falls noch keine existiert).\n'
    + '  2. psql "postgresql://<user>:<passwort>@<host>:<port>/<datenbank>" < backup.sql\n',
    { name: 'README.txt' },
  );

  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}
