/**
 * Shared, non-blocking entry point for every business flow that needs a TSE
 * signature (Kassenbeleg-V1, Bestellung-V1, SonstigerVorgang — the literal
 * TSE `processType` strings, see tse/processData.ts; these are distinct from
 * the DSFinV-K `BON_TYP` values `Beleg`/`AVBestellung`/`AVSonstige` used
 * elsewhere for the export).
 *
 * AEAO zu § 146a AO, Nr. 1.14.3 explicitly tolerates continuing operation
 * without a working TSE as long as only the TSE (not the whole system) is
 * affected — there is no obligation to block the underlying business
 * operation, and no obligation to later re-submit what happened during the
 * outage. This function therefore never throws: it always resolves to either
 * a populated signature or `null` plus a warning message, so every caller
 * gets the same simple, safe pattern instead of re-implementing try/catch +
 * outage bookkeeping at each call site. See docs/TSE-Integration.md →
 * "TSE-Ausfall" for the full rationale and the legal source.
 */
import { config } from '../config.js';
import { startTransaction, finishTransaction } from './client.js';
import { recordTseFailure, recordTseRecovered } from './outage.js';
import { KASSENBELEG_PROCESS_TYPE, buildAvBelegabbruchProcessData } from './processData.js';

/** The six `tse_*` columns shared by `invoice`, `service_order`, and `order_cancellation`. */
export interface TseSignatureFields {
  transactionNumber: number;
  signatureCounter: number;
  signature: string;
  serialNumber: string;
  startTime: Date;
  endTime: Date;
}

/** Result of an attempted TSE signature — never throws, see module docs. */
export interface TseSigningResult {
  /** `null` when the TSE is unconfigured or the signing call failed. */
  signature: TseSignatureFields | null;
  /** User-facing warning to surface in the UI, or `null` when signing succeeded. */
  warning: string | null;
}

/**
 * Attempts to sign one fiscal transaction (`start` + `finish`) for the given
 * process type. `start` always gets an empty processType/processData — see
 * the inline comment below — `processType`/`processData` are only ever sent
 * with `finish`. Never throws — a failure (or missing configuration) is
 * reported via the returned `warning`, never as a rejected promise.
 *
 * If `start` succeeds but `finish` then fails, the transaction is left open
 * on the TSE (it counts against `maxStartedTransactions` until closed) — this
 * function immediately attempts a follow-up `finish` using the Kassenbeleg-V1
 * `AVBelegabbruch` processData Anhang I's own worked example gives for this
 * case, per `docs/Anforderungen.md` → "Zu signierende Vorgänge in FairPOS" →
 * Signaturregeln. That cleanup attempt is itself best-effort: if it also
 * fails (e.g. the TSE is genuinely unreachable), the error is swallowed —
 * there's nothing more this function can do, and the caller already gets a
 * clear warning either way.
 *
 * @param processType - The literal TSE processType for `finish`, e.g. `Kassenbeleg-V1`, `Bestellung-V1`, `SonstigerVorgang` (see tse/processData.ts exports).
 * @param processData - Payload bytes for `finish` (see tse/processData.ts builders).
 * @returns The signature fields (or `null`) plus a UI warning (or `null`).
 */
export async function signTseTransaction(
  processType: string,
  processData: Buffer,
): Promise<TseSigningResult> {
  if (!config.tseMountPoint || !config.tseClientId) {
    await recordTseFailure('TSE ist nicht konfiguriert').catch(() => { /* logging must not break the sale */ });
    return {
      signature: null,
      warning: 'TSE ist nicht konfiguriert — Vorgang wurde ohne TSE-Signatur gebucht.',
    };
  }

  let start;
  try {
    // Anhang I: "Für alle Vorgangstypen gilt, dass processType und
    // processData für die StartTransaction-Operation immer leer sind."
    start = await startTransaction('', Buffer.alloc(0));
  } catch (e) {
    // Never started — there is nothing to abort on the TSE.
    await recordTseFailure(e instanceof Error ? e.message : String(e)).catch(() => { /* logging must not break the sale */ });
    return {
      signature: null,
      warning: 'TSE nicht erreichbar — Vorgang wurde ohne TSE-Signatur gebucht. Bitte Störung schnellstmöglich beheben.',
    };
  }

  try {
    const finish = await finishTransaction(start.transactionNumber, processType, processData);
    await recordTseRecovered().catch(() => { /* logging must not break the sale */ });
    return {
      signature: {
        transactionNumber: finish.transactionNumber,
        signatureCounter: finish.signatureCounter,
        signature: finish.signature,
        serialNumber: finish.serialNumber,
        startTime: new Date(start.logTime * 1000),
        endTime: new Date(finish.logTime * 1000),
      },
      warning: null,
    };
  } catch (e) {
    // Started but never properly finished — close it out with the AVBelegabbruch
    // Vorgangstyp Anhang I's own worked example uses, so it doesn't stay open
    // on the TSE forever. Note this is a Kassenbeleg-V1 processData value
    // (Anhang I), not a distinct TSE processType. Best-effort: if the TSE is
    // genuinely unreachable this fails too, and we can't do anything further.
    await finishTransaction(start.transactionNumber, KASSENBELEG_PROCESS_TYPE, buildAvBelegabbruchProcessData())
      .catch(() => { /* best-effort cleanup — the caller's warning below covers this either way */ });
    await recordTseFailure(e instanceof Error ? e.message : String(e)).catch(() => { /* logging must not break the sale */ });
    return {
      signature: null,
      warning: 'TSE nicht erreichbar — Vorgang wurde ohne TSE-Signatur gebucht. Bitte Störung schnellstmöglich beheben.',
    };
  }
}
