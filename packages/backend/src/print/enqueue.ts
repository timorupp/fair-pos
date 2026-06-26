/** Enqueues a print job by inserting it into `print_job`. The DB trigger emits a NOTIFY which wakes the worker. */
import type { PrintJobType } from '@fairpos/shared';
import { query } from '../db/client.js';
import { encodeContent } from './worker.helpers.js';

/** Result of enqueueing a print job. */
export interface EnqueuedJob {
  id: string;
}

/**
 * Inserts a new print job for the given printer. The DB trigger fires a
 * NOTIFY which wakes the print worker, who then sends `data` to the printer.
 *
 * @param printerId - UUID of the target printer row.
 * @param type - Kind of document (`order_slip`, `receipt`, `daily_closing`, `test_print`).
 * @param data - Raw ESC/POS bytes; base64-encoded internally before storage.
 * @param referenceId - Optional FK back to the source row (invoice, daily_closing) for later look-up.
 * @returns The id of the inserted `print_job` row.
 */
export async function enqueuePrintJob(
  printerId: string,
  type: PrintJobType,
  data: Buffer,
  referenceId: string | null = null,
): Promise<EnqueuedJob> {
  const result = await query<{ id: string }>(
    `INSERT INTO print_job (printer_id, type, content, reference_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [printerId, type, encodeContent(data), referenceId],
  );
  return { id: result.rows[0]!.id };
}
