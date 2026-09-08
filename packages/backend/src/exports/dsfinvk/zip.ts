/** Packages the DSFinV-K CSV files + index.xml + its DTD into a single ZIP buffer. */
import { ZipArchive } from 'archiver';
import { toCsv } from './csv.js';
import { buildIndexXml } from './index-xml.js';
import { GDPDU_DTD_CONTENT, GDPDU_DTD_FILENAME } from './gdpduDtd.js';
import type { DsfinvkExport } from './types.js';

/**
 * Serialises a built export into a ZIP archive: one CSV file per non-empty
 * table, `index.xml` describing them all, and the DTD `index.xml`'s
 * `<!DOCTYPE>` references — required to be alongside it on the medium (see
 * `index-xml.ts`).
 *
 * @param data - The row data built by `buildDsfinvkExport`.
 * @returns The complete ZIP archive as a Buffer.
 */
export async function buildDsfinvkZip(data: DsfinvkExport): Promise<Buffer> {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve, reject) => {
    archive.on('end', resolve);
    archive.on('error', reject);
  });

  for (const filename of Object.keys(data) as (keyof DsfinvkExport)[]) {
    // Each DsfinvkExport member is an array of flat string/number-valued rows;
    // the union-of-arrays shape defeats toCsv's generic inference here, so
    // widen to a common shape — safe, since toCsv only reads own keys at runtime.
    const rows = data[filename] as unknown as Record<string, string | number>[];
    if (rows.length === 0) continue;
    archive.append(toCsv(rows), { name: filename });
  }
  archive.append(buildIndexXml(data), { name: 'index.xml' });
  archive.append(GDPDU_DTD_CONTENT, { name: GDPDU_DTD_FILENAME });

  await archive.finalize();
  await done;
  return Buffer.concat(chunks);
}
