/**
 * Product identity of FairPOS as an "elektronisches Aufzeichnungssystem"
 * (eAs) and the field list for the ELSTER notification under § 146a Abs. 4
 * AO (Task #154). The constants are shared with the DSFinV-K export
 * (`exports/dsfinvk/rows.ts`, `Stamm_Kassen`) so the export and the
 * notification can never drift apart. Pure — no DB or TSE access here, see
 * `GET /api/admin/tse/eas` for the loading side.
 */
import { formatGermanDateTime } from '../receipt/format.js';
import type { TseInfo } from '../tse/types.js';

/** Software name ("Software des eAs", DSFinV-K `KASSE_SW_BRAND`). */
export const EAS_SOFTWARE = 'FairPOS';

/** Manufacturer ("Hersteller des eAs", DSFinV-K `KASSE_BRAND`) — Nutzervorgabe 2026-09-21/2026-11-05. */
export const EAS_MANUFACTURER = 'FairPOS Community';

/** Model designation ("Modell des eAs", DSFinV-K `KASSE_MODELL`). */
export const EAS_MODEL = 'FairPOS';

/** Value of the ELSTER dropdown "Art des eAs". */
export const EAS_TYPE = 'Computergestützte/PC-Kassensysteme';

/**
 * Prefix the ELSTER form already prints in front of the BSI certification ID
 * input ("BSI-Zertifizierungs-ID: „BSI-K-TR-“"), so only the remainder has to
 * be entered there.
 */
const BSI_ID_FORM_PREFIX = 'BSI-K-TR-';

/** One row of the eAs notification, in ELSTER form order. */
export interface EasField {
  /** Field label exactly as in the ELSTER form. */
  label: string;
  /** Value to enter, or `null` if it couldn't be determined (e.g. TSE unreachable). */
  value: string | null;
}

/** Inputs for {@link buildEasFields}, already loaded by the caller. */
export interface EasSource {
  /** Current FairPOS version (`config.version`, Task #148). */
  softwareVersion: string;
  /** `system_serial` setting, or `null` if not yet generated. */
  systemSerial: string | null;
  /**
   * When `system_serial` was generated — FairPOS' commissioning date
   * ("Inbetriebnahme des eAs", Nutzervorgabe 2026-11-05). `null` if unknown.
   */
  commissionedAt: Date | null;
  /** Live TSE info fields, or `null` if the TSE is unconfigured/unreachable. */
  tse: Pick<TseInfo, 'tseSerialNumber' | 'formFactor' | 'tseCertificationId'> | null;
}

/**
 * Strips the `BSI-K-TR-` prefix the ELSTER form already shows, so the copied
 * value fits the input as-is. IDs in any other format are returned unchanged.
 *
 * @param certificationId - Certification ID as reported by the TSE.
 * @returns The ID without the form's fixed prefix.
 */
export function stripBsiIdFormPrefix(certificationId: string): string {
  return certificationId.startsWith(BSI_ID_FORM_PREFIX)
    ? certificationId.slice(BSI_ID_FORM_PREFIX.length)
    : certificationId;
}

/**
 * Builds the eAs notification fields in the order of the ELSTER form. Only
 * fields FairPOS knows itself are included — manually maintained ones
 * (Anschaffung, TSE-Inbetriebnahme, Bemerkungen) are deliberately left out
 * (Nutzervorgabe 2026-11-05).
 *
 * @param source - Already-loaded version, serial, commissioning date and TSE info.
 * @returns The fields in form order; unknown values are `null`.
 */
export function buildEasFields(source: EasSource): EasField[] {
  const nonEmpty = (v: string | undefined): string | null => (v ? v : null);
  return [
    { label: 'Art des eAs', value: EAS_TYPE },
    { label: 'Software des eAs', value: EAS_SOFTWARE },
    { label: 'Software-Version des eAs', value: source.softwareVersion },
    { label: 'Seriennummer des eAs / Software-App', value: source.systemSerial },
    { label: 'Hersteller des eAs', value: EAS_MANUFACTURER },
    { label: 'Modell des eAs', value: EAS_MODEL },
    { label: 'Seriennummer der TSE', value: nonEmpty(source.tse?.tseSerialNumber) },
    { label: 'Art / Bauform der TSE', value: nonEmpty(source.tse?.formFactor) },
    {
      label: 'BSI-Zertifizierungs-ID: „BSI-K-TR-“',
      value: source.tse?.tseCertificationId ? stripBsiIdFormPrefix(source.tse.tseCertificationId) : null,
    },
    {
      label: 'Inbetriebnahme des eAs',
      // Date part only (`DD.MM.YYYY`), host timezone like every other printed date.
      value: source.commissionedAt ? formatGermanDateTime(source.commissionedAt).slice(0, 10) : null,
    },
  ];
}
