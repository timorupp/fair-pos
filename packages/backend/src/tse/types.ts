/** Shared types for the TSE client. See docs/TSE-Integration.md for the CLI contract these mirror. */

/** Result of a `start`/`update`/`finish` transaction command. */
export interface TseTransactionResult {
  /** Assigned (start) or confirmed (update/finish) transaction number. */
  transactionNumber: number;
  /** TSE-wide, monotonically increasing signature counter for this signature. */
  signatureCounter: number;
  /** Timestamp of the log message, in Unix seconds (comes from the TSE clock, not the host). */
  logTime: number;
  /** Hex-encoded signature bytes. */
  signature: string;
  /** Hex-encoded serial number of the signing device. */
  serialNumber: string;
}

/** Snapshot of TSE health/status, as returned by the `info` command. */
export interface TseInfo {
  hasPassedSelfTest: boolean;
  hasValidTime: boolean;
  startedTransactions: number;
  maxStartedTransactions: number;
  remainingSignatures: number;
  maxSignatures: number;
  /** Unix seconds. */
  certificateExpirationDate: number;
  /** Seconds until the next mandatory self test. */
  timeUntilNextSelfTest: number;
  /** Seconds until the next mandatory time synchronization. */
  timeUntilNextTimeSynchronization: number;
  tseCertificationId: string;
  formFactor: string;
  /** Hex-encoded TSE serial number. */
  tseSerialNumber: string;
}

/**
 * Thrown when the TSE CLI reports a failure. `code` is either a raw
 * `WORM_ERROR_*` value from the Swissbit SDK, or `-1` for CLI-level usage
 * errors (wrong argument count, unknown command, bad mount point, ...).
 */
export class TseError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'TseError';
  }
}
