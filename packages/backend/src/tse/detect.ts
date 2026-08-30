/**
 * Finds candidate mount points for the "TSE testen"/"Auto-erkennen" UI
 * (Systemeinstellungen → System), so the admin doesn't have to know or type
 * the exact filesystem path a USB-mounted TSE ends up at. Deliberately does
 * NOT pin to one specific device — the server may be shared by several
 * clubs, each bringing their own TSE, so there is no single "correct"
 * device to remember between uses (see docs/SETUP.md).
 */
import { execFile } from 'node:child_process';
import { getTseInfoAt } from './client.js';
import type { TseInfo } from './types.js';

/** One currently-mounted removable filesystem, as a candidate TSE location. */
export interface TseMountCandidate {
  mountPoint: string;
  /** Block device name, e.g. `sdb1` — shown in the UI so multiple candidates are distinguishable. */
  device: string;
}

/** Raw shape of one node in `lsblk -J`'s `blockdevices` tree (recursive via `children`). */
export interface LsblkNode {
  name: string;
  mountpoint: string | null;
  tran: string | null;
  rm: boolean | string | null;
  children?: LsblkNode[];
}

/** True for `rm` values meaning "removable" — lsblk versions differ between JSON boolean and `"0"`/`"1"` strings. */
function isRemovable(rm: LsblkNode['rm']): boolean {
  return rm === true || rm === '1';
}

/**
 * Walks the `lsblk` device tree, propagating each node's `tran`/`rm` down to
 * children that don't report their own (only the top-level disk usually
 * does), and collects every mounted node that is USB-attached or removable.
 *
 * @param nodes - Siblings at the current tree level.
 * @param inheritedTran - Nearest ancestor's `tran`, used when a node has none of its own.
 * @param inheritedRemovable - Nearest ancestor's removable flag, same reasoning.
 * @returns Flattened list of removable, currently-mounted candidates.
 */
export function collectCandidates(
  nodes: LsblkNode[],
  inheritedTran: string | null = null,
  inheritedRemovable = false,
): TseMountCandidate[] {
  const out: TseMountCandidate[] = [];
  for (const node of nodes) {
    const tran = node.tran ?? inheritedTran;
    const removable = isRemovable(node.rm) || inheritedRemovable;
    if (node.mountpoint && (tran === 'usb' || removable)) {
      out.push({ mountPoint: node.mountpoint, device: node.name });
    }
    if (node.children?.length) {
      out.push(...collectCandidates(node.children, tran, removable));
    }
  }
  return out;
}

/**
 * Lists currently-mounted removable/USB filesystems — candidates for the
 * "wo ist die TSE gemountet" dropdown. Purely informational: doesn't check
 * whether a real TSE is actually present at any of them (see {@link detectTse}
 * for that).
 *
 * @returns Every removable, currently-mounted filesystem `lsblk` reports.
 */
export function listTseMountCandidates(): Promise<TseMountCandidate[]> {
  return new Promise((resolve, reject) => {
    execFile('lsblk', ['-J', '-o', 'NAME,MOUNTPOINT,TRAN,RM'], (err, stdout) => {
      if (err) {
        reject(new Error(`lsblk fehlgeschlagen: ${err.message}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { blockdevices: LsblkNode[] };
        resolve(collectCandidates(parsed.blockdevices ?? []));
      } catch (e) {
        reject(new Error(`lsblk-Ausgabe nicht parsebar: ${e instanceof Error ? e.message : String(e)}`));
      }
    });
  });
}

/** Result of {@link detectTse} — either a found TSE, or the full list of candidates that were tried and rejected. */
export interface TseDetectResult {
  found: { mountPoint: string; info: TseInfo } | null;
  /** Every candidate that was probed and did NOT turn out to be a valid TSE (empty if `found` is set, or if there were no candidates at all). */
  triedAndRejected: TseMountCandidate[];
}

/**
 * Probes every currently-mounted removable filesystem and returns the first
 * one that's actually a valid Swissbit TSE. Relies entirely on
 * `worm_init`/`info` (via `native/tse-cli`) to decide "is this really a TSE"
 * — no path/label guessing, so a random USB stick just fails cleanly rather
 * than being mistaken for one. Candidates are tried sequentially (all TSE
 * calls share one queue anyway, see tse/queue.ts), so this can take a couple
 * seconds if several removable devices are plugged in.
 *
 * @param listCandidates - Defaults to {@link listTseMountCandidates} (real
 *   `lsblk`); overridable in tests so the probing logic below can be
 *   exercised without a real removable device attached.
 * @returns The first valid TSE found (mount point + its `info` snapshot), or
 *   `null` plus the full rejected-candidate list if none of them are a TSE.
 */
export async function detectTse(
  listCandidates: () => Promise<TseMountCandidate[]> = listTseMountCandidates,
): Promise<TseDetectResult> {
  const candidates = await listCandidates();
  const rejected: TseMountCandidate[] = [];
  for (const candidate of candidates) {
    try {
      const info = await getTseInfoAt(candidate.mountPoint);
      return { found: { mountPoint: candidate.mountPoint, info }, triedAndRejected: rejected };
    } catch {
      rejected.push(candidate);
    }
  }
  return { found: null, triedAndRejected: rejected };
}
